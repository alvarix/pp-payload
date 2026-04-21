import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapDeliveryMethod,
  splitName,
  mapAddress,
  getSessionPrefill,
  _resetStripeClient,
} from '@/lib/stripe'

// ---------------------------------------------------------------------------
// Pure helper tests — no mocking needed
// ---------------------------------------------------------------------------

describe('splitName', () => {
  it('splits first and last', () => {
    expect(splitName('John Smith')).toEqual({ firstName: 'John', lastName: 'Smith' })
  })
  it('puts extra words in last', () => {
    expect(splitName('Mary Jane Watson')).toEqual({ firstName: 'Mary', lastName: 'Jane Watson' })
  })
  it('handles single word', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })
  it('handles null/empty', () => {
    expect(splitName(null)).toEqual({ firstName: '', lastName: '' })
    expect(splitName('')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('mapDeliveryMethod', () => {
  it('returns pickup for known pickup keywords', () => {
    expect(mapDeliveryMethod('Pickup')).toBe('pickup')
    expect(mapDeliveryMethod('Local Pickup')).toBe('pickup')
    expect(mapDeliveryMethod('Pick Up in Store')).toBe('pickup')
    expect(mapDeliveryMethod('Collect at venue')).toBe('pickup')
  })
  it('returns delivery for anything else', () => {
    expect(mapDeliveryMethod('Standard Shipping')).toBe('delivery')
    expect(mapDeliveryMethod('Ground')).toBe('delivery')
  })
  it('returns undefined for null/empty', () => {
    expect(mapDeliveryMethod(null)).toBeUndefined()
    expect(mapDeliveryMethod('')).toBeUndefined()
  })
})

describe('mapAddress', () => {
  it('maps a Stripe address to our shape', () => {
    expect(
      mapAddress({ line1: '123 Main St', line2: 'Apt 4', city: 'Brooklyn', state: 'NY', postal_code: '11201', country: 'US' }),
    ).toEqual({ street1: '123 Main St', street2: 'Apt 4', city: 'Brooklyn', state: 'NY', zip: '11201', country: 'US' })
  })
  it('returns undefined for null', () => {
    expect(mapAddress(null)).toBeUndefined()
  })
  it('fills empty strings for missing fields', () => {
    const result = mapAddress({ line1: '1 Park Ave', line2: null, city: 'NY', state: null, postal_code: null, country: 'US' })
    expect(result).toEqual({ street1: '1 Park Ave', street2: '', city: 'NY', state: '', zip: '', country: 'US' })
  })
})

// ---------------------------------------------------------------------------
// getSessionPrefill — mock the Stripe constructor
// ---------------------------------------------------------------------------

// vi.hoisted runs before vi.mock hoisting so mockRetrieve is available inside the factory
const { mockRetrieve } = vi.hoisted(() => ({ mockRetrieve: vi.fn() }))

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  })),
}))

/** Minimal paid session fixture */
function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_123',
    payment_status: 'paid',
    payment_link: 'plink_abc',
    payment_intent: 'pi_abc',
    customer: 'cus_abc',
    amount_total: 12500,
    currency: 'usd',
    total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 0 },
    customer_details: {
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+15551234567',
      address: { line1: '123 Main St', line2: null, city: 'Brooklyn', state: 'NY', postal_code: '11201', country: 'US' },
    },
    shipping_details: {
      name: 'Jane Doe',
      address: { line1: '123 Main St', line2: null, city: 'Brooklyn', state: 'NY', postal_code: '11201', country: 'US' },
    },
    shipping_cost: null,
    discounts: [],
    metadata: { job_type: 'street', delivery_method: 'delivery' },
    ...overrides,
  }
}

describe('getSessionPrefill', () => {
  beforeEach(() => {
    _resetStripeClient()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
    mockRetrieve.mockReset()
  })

  it('returns ok:true with prefill data for a paid session', async () => {
    mockRetrieve.mockResolvedValueOnce(paidSession())
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.prefill.email).toBe('jane@example.com')
    expect(result.prefill.firstName).toBe('Jane')
    expect(result.prefill.lastName).toBe('Doe')
    expect(result.prefill.phone).toBe('+15551234567')
    expect(result.stripe.amountPaidCents).toBe(12500)
    expect(result.stripe.sessionId).toBe('cs_test_123')
    expect(result.jobAutoFill.jobType).toBe('street')
    expect(result.jobAutoFill.deliveryMethod).toBe('delivery')
  })

  it('returns payment_failed for unpaid session', async () => {
    mockRetrieve.mockResolvedValueOnce(paidSession({ payment_status: 'unpaid' }))
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('payment_failed')
  })

  it('returns unexpected when Stripe throws', async () => {
    mockRetrieve.mockRejectedValueOnce(new Error('Network error'))
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unexpected')
  })

  it('returns unexpected when STRIPE_SECRET_KEY is missing', async () => {
    _resetStripeClient()
    delete process.env.STRIPE_SECRET_KEY
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unexpected')
  })

  it('maps shipping_rate display_name to deliveryMethod', async () => {
    mockRetrieve.mockResolvedValueOnce(
      paidSession({
        metadata: { job_type: 'studio' },
        shipping_cost: { shipping_rate: { id: 'shr_1', display_name: 'Local Pickup', type: 'fixed_amount' } },
      }),
    )
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.jobAutoFill.deliveryMethod).toBe('pickup')
    expect(result.jobAutoFill.jobType).toBe('studio')
  })

  it('extracts coupon names from discounts', async () => {
    mockRetrieve.mockResolvedValueOnce(
      paidSession({
        total_details: { amount_discount: 1000, amount_tax: 0, amount_shipping: 0 },
        // Stripe v22: discounts elements are { coupon, promotion_code } directly
        discounts: [
          { coupon: { id: 'c_1', name: 'SUMMER10' }, promotion_code: null },
        ],
      }),
    )
    const result = await getSessionPrefill('cs_test_123')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.stripe.amountDiscountCents).toBe(1000)
    expect(result.stripe.discountCodes).toContain('SUMMER10')
  })
})
