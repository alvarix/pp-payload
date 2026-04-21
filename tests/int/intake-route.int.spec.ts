// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks so the factory sees them at import time.
const { mockRetrieve, mockCreate, mockFind, mockUpdate } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockCreate: vi.fn(),
  mockFind: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  })),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find: mockFind,
    create: mockCreate,
    update: mockUpdate,
  })),
}))

vi.mock('@payload-config', () => ({ default: {} }))

// Import after mocks
import { POST } from '@/app/api/intake/route'

/**
 * Build a FormData body that mimics what a malicious client could POST.
 * Includes forged stripe_* fields that the server should now ignore.
 */
function buildForgedForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('first_name', 'Mallory')
  fd.set('last_name', 'Forger')
  fd.set('email', 'mallory@example.com')
  fd.set('phone', '+15550000000')
  fd.set('pet_name', 'Fluffy')
  // Forged fields — server should not trust these anymore.
  fd.set('stripe_payment_link_id', 'plink_FAKE')
  fd.set('stripe_payment_intent_id', 'pi_FAKE')
  fd.set('stripe_customer_id', 'cus_FAKE')
  fd.set('stripe_amount_paid_cents', '999999')
  fd.set('stripe_currency', 'xxx')
  fd.set('stripe_payment_status', 'paid')
  fd.set('stripe_amount_discount_cents', '100')
  fd.set('stripe_discount_codes', 'FAKE_COUPON')
  fd.set('billing_street1', '1 Attacker Way')
  fd.set('shipping_line1', '1 Attacker Way')
  fd.set('job_type', 'studio')
  fd.set('delivery_method', 'delivery')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

function buildPaidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_real',
    payment_status: 'paid',
    payment_link: 'plink_REAL',
    payment_intent: 'pi_REAL',
    customer: 'cus_REAL',
    amount_total: 12500,
    currency: 'usd',
    total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 0 },
    customer_details: {
      email: 'real@example.com',
      name: 'Real Customer',
      phone: '+15551112222',
      address: null,
    },
    shipping_details: null,
    shipping_cost: null,
    discounts: [],
    metadata: { job_type: 'street' },
    ...overrides,
  }
}

function makeRequest(body: FormData): Request {
  return new Request('http://localhost:3000/api/intake', {
    method: 'POST',
    body,
  })
}

describe('/api/intake security — server-side Stripe verification', () => {
  beforeEach(() => {
    mockRetrieve.mockReset()
    mockCreate.mockReset()
    mockFind.mockReset()
    mockUpdate.mockReset()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'

    // Default: no existing client.
    mockFind.mockResolvedValue({ docs: [] })
    // Default: payload.create returns an object with a predictable id.
    mockCreate.mockImplementation(async (args: { collection: string }) => ({
      id: args.collection === 'jobs' ? 42 : 1,
    }))
  })

  it('ignores forged hidden fields when no session_id is present', async () => {
    const form = buildForgedForm() // no stripe_checkout_session_id
    const res = await POST(makeRequest(form) as never)

    expect(res.status).toBe(200)

    // Find the jobs create call
    const jobCall = mockCreate.mock.calls.find((c) => c[0].collection === 'jobs')
    expect(jobCall).toBeDefined()
    const jobData = jobCall![0].data

    // None of the forged values should have leaked into the Job.
    expect(jobData.stripe_payment_link_id).toBeUndefined()
    expect(jobData.stripe_payment_intent_id).toBeUndefined()
    expect(jobData.stripe_customer_id).toBeUndefined()
    expect(jobData.stripe_amount_paid_cents).toBeUndefined()
    expect(jobData.stripe_payment_status).toBeUndefined()
    expect(jobData.payment_methods).toEqual([])
    expect(jobData.job_type).toBeUndefined()
    expect(jobData.delivery_method).toBeUndefined()
    expect(jobData.shipping_address).toBeUndefined()

    // Stripe should not have been called at all.
    expect(mockRetrieve).not.toHaveBeenCalled()
  })

  it('uses server-fetched values (not form values) when session is verified', async () => {
    mockRetrieve.mockResolvedValueOnce(buildPaidSession())
    const form = buildForgedForm({ stripe_checkout_session_id: 'cs_test_real' })
    const res = await POST(makeRequest(form) as never)

    expect(res.status).toBe(200)
    expect(mockRetrieve).toHaveBeenCalledWith('cs_test_real', expect.any(Object))

    const jobCall = mockCreate.mock.calls.find((c) => c[0].collection === 'jobs')
    const jobData = jobCall![0].data

    // Real values from Stripe — not the forged ones.
    expect(jobData.stripe_checkout_session_id).toBe('cs_test_real')
    expect(jobData.stripe_payment_link_id).toBe('plink_REAL')
    expect(jobData.stripe_payment_intent_id).toBe('pi_REAL')
    expect(jobData.stripe_customer_id).toBe('cus_REAL')
    expect(jobData.stripe_amount_paid_cents).toBe(12500)
    expect(jobData.stripe_currency).toBe('usd')
    expect(jobData.stripe_payment_status).toBe('paid')
    expect(jobData.job_type).toBe('street')
    expect(jobData.payment_methods).toEqual([
      expect.objectContaining({ method: 'website', amount: 125 }),
    ])
  })

  it('rejects with 400 when claimed session fails verification', async () => {
    mockRetrieve.mockResolvedValueOnce(buildPaidSession({ payment_status: 'unpaid' }))
    const form = buildForgedForm({ stripe_checkout_session_id: 'cs_test_unpaid' })
    const res = await POST(makeRequest(form) as never)

    expect(res.status).toBe(400)
    // No Job should have been created.
    const jobCall = mockCreate.mock.calls.find((c) => c[0].collection === 'jobs')
    expect(jobCall).toBeUndefined()
  })

  it('rejects with 400 when Stripe retrieve throws', async () => {
    mockRetrieve.mockRejectedValueOnce(new Error('network error'))
    const form = buildForgedForm({ stripe_checkout_session_id: 'cs_test_boom' })
    const res = await POST(makeRequest(form) as never)

    expect(res.status).toBe(400)
    const jobCall = mockCreate.mock.calls.find((c) => c[0].collection === 'jobs')
    expect(jobCall).toBeUndefined()
  })
})
