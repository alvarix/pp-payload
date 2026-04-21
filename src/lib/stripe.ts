import Stripe from 'stripe'

// -- Pure mapping helpers (exported for unit testing) -------------------------

const PICKUP_KEYWORDS = ['pickup', 'pick up', 'pick-up', 'local pickup', 'collect']

/** Map a Stripe shipping-rate display name to our delivery_method enum. */
export function mapDeliveryMethod(
  displayName: string | null | undefined,
): 'pickup' | 'delivery' | undefined {
  if (!displayName) return undefined
  const lower = displayName.toLowerCase()
  return PICKUP_KEYWORDS.some((k) => lower.includes(k)) ? 'pickup' : 'delivery'
}

/** Split a full name into first + last. Extra words go into last. */
export function splitName(full: string | null | undefined): {
  firstName: string
  lastName: string
} {
  if (!full?.trim()) return { firstName: '', lastName: '' }
  const parts = full.trim().split(/\s+/)
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Normalise a Stripe Address to our Client/Job address shape. */
export function mapAddress(
  addr: Stripe.Address | null | undefined,
): { street1: string; street2: string; city: string; state: string; zip: string; country: string } | undefined {
  if (!addr) return undefined
  return {
    street1: addr.line1 ?? '',
    street2: addr.line2 ?? '',
    city: addr.city ?? '',
    state: addr.state ?? '',
    zip: addr.postal_code ?? '',
    country: addr.country ?? '',
  }
}

// -- Return types -------------------------------------------------------------

export type AddressShape = ReturnType<typeof mapAddress>

export type StripeData = {
  sessionId: string
  paymentLinkId: string | null
  paymentIntentId: string | null
  customerId: string | null
  amountPaidCents: number
  currency: string
  paymentStatus: string
  amountDiscountCents: number
  discountCodes: string[]
}

export type JobAutoFill = {
  jobType?: 'street' | 'studio'
  deliveryMethod?: 'pickup' | 'delivery'
}

export type Prefill = {
  email: string
  firstName: string
  lastName: string
  phone: string
  billingAddress?: AddressShape
  shippingAddress?: AddressShape
}

export type SessionPrefill =
  | { ok: true; prefill: Prefill; stripe: StripeData; jobAutoFill: JobAutoFill }
  | { ok: false; reason: 'payment_failed' | 'unexpected'; message: string }

// -- Stripe client (lazy, guarded) -------------------------------------------

let _client: Stripe | null = null

/** Returns a cached Stripe client. Throws if STRIPE_SECRET_KEY is absent. */
export function getStripeClient(): Stripe {
  if (_client) return _client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  _client = new Stripe(key, { timeout: 3000 })
  return _client
}

/** Reset cached client — only for tests. */
export function _resetStripeClient() {
  _client = null
}

// -- Main export --------------------------------------------------------------

/**
 * Retrieve a Stripe Checkout Session and extract all data needed for intake
 * prefill and job auto-fill.
 *
 * Returns { ok: false, reason: 'payment_failed' } if payment wasn't completed.
 * Returns { ok: false, reason: 'unexpected' } on any network or validation error.
 * Both failure cases are safe to show to users without exposing raw error details.
 */
export async function getSessionPrefill(sessionId: string): Promise<SessionPrefill> {
  try {
    const stripe = getStripeClient()

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        'payment_intent',
        'customer',
        'shipping_cost.shipping_rate',
        'discounts.coupon',          // needed to read coupon.name
        'discounts.promotion_code',  // needed to read promotion_code.code
        'collected_information',     // needed for shipping_details in v22
      ],
    })

    if (session.payment_status !== 'paid') {
      return {
        ok: false,
        reason: 'payment_failed',
        message: 'Payment was not completed.',
      }
    }

    // -- Contact ---------------------------------------------------------------
    // In Stripe v22, shipping_details moved to collected_information.shipping_details
    const { firstName, lastName } = splitName(session.customer_details?.name)
    const billingAddress = mapAddress(session.customer_details?.address)
    const collectedShipping = session.collected_information?.shipping_details
    const shippingAddress = mapAddress(
      collectedShipping
        ? { line1: collectedShipping.address.line1, line2: collectedShipping.address.line2, city: collectedShipping.address.city, state: collectedShipping.address.state, postal_code: collectedShipping.address.postal_code, country: collectedShipping.address.country }
        : null,
    )

    // -- IDs -------------------------------------------------------------------
    const paymentIntentId =
      session.payment_intent == null
        ? null
        : typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent.id

    const customerId =
      session.customer == null
        ? null
        : typeof session.customer === 'string'
          ? session.customer
          : session.customer.id

    const paymentLinkId =
      session.payment_link == null
        ? null
        : typeof session.payment_link === 'string'
          ? session.payment_link
          : (session.payment_link as unknown as { id: string }).id

    // -- Discounts -------------------------------------------------------------
    // In Stripe v22, session.discounts elements are { coupon, promotion_code } directly
    const discountCodes: string[] = []
    for (const d of session.discounts ?? []) {
      const promo = d.promotion_code
      if (promo && typeof promo !== 'string') {
        discountCodes.push(promo.code)
      } else {
        const coupon = d.coupon
        if (coupon && typeof coupon !== 'string') {
          const name = coupon.name ?? coupon.id
          if (name) discountCodes.push(name)
        }
      }
    }

    // -- Delivery method -------------------------------------------------------
    // Prefer the shipping-rate display name chosen at checkout, then Payment Link metadata.
    const shippingRate = session.shipping_cost?.shipping_rate
    const rateDisplayName =
      shippingRate && typeof shippingRate !== 'string'
        ? (shippingRate as Stripe.ShippingRate).display_name
        : null
    const deliveryMethod =
      mapDeliveryMethod(rateDisplayName) ??
      mapDeliveryMethod(session.metadata?.delivery_method)

    // -- Job type --------------------------------------------------------------
    const rawJobType = session.metadata?.job_type
    const jobType =
      rawJobType === 'street' || rawJobType === 'studio' ? rawJobType : undefined

    return {
      ok: true,
      prefill: {
        email: session.customer_details?.email ?? '',
        firstName,
        lastName,
        phone: session.customer_details?.phone ?? '',
        billingAddress,
        shippingAddress,
      },
      stripe: {
        sessionId: session.id,
        paymentLinkId,
        paymentIntentId,
        customerId,
        amountPaidCents: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        paymentStatus: session.payment_status,
        amountDiscountCents: session.total_details?.amount_discount ?? 0,
        discountCodes,
      },
      jobAutoFill: { jobType, deliveryMethod },
    }
  } catch (err) {
    console.error('[stripe] getSessionPrefill error:', err)
    return {
      ok: false,
      reason: 'unexpected',
      message: 'Could not verify your session.',
    }
  }
}
