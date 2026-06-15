import type Stripe from "stripe";

/**
 * Unified shape returned by both extractPosPayment() and extractPosFromInvoice().
 * The route handler uses this to create a Client + Job stub regardless of which
 * Stripe event triggered the webhook.
 */
export interface PosPaymentData {
  email: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string;
  customerId: string | null;
  metadata: Record<string, string>;
}

/**
 * Extracts POS-relevant data from a Stripe PaymentIntent.
 *
 * Returns `null` when the charge is not card-present (i.e. not a Terminal
 * payment) or when no email is available — both cases should be silently
 * ignored by the webhook handler.
 *
 * @param pi - Fully-expanded PaymentIntent from Stripe (with latest_charge expanded)
 * @returns Extracted data object, or null if this is not a billable POS event
 */
export function extractPosPayment(
  pi: Stripe.PaymentIntent & { latest_charge?: Stripe.Charge | null },
): PosPaymentData | null {
  const charge = pi.latest_charge as Stripe.Charge | null | undefined;

  // Must be a card-present (Terminal) charge.
  if (charge?.payment_method_details?.type !== "card_present") {
    return null;
  }

  // Email is required — skip and log if absent
  const email =
    pi.receipt_email ??
    (charge?.billing_details?.email || null);

  if (!email) {
    console.warn(
      `[stripe-pos] PaymentIntent ${pi.id} has no email — skipping record creation`,
    );
    return null;
  }

  return {
    email,
    amountCents: pi.amount,
    currency: pi.currency,
    paymentIntentId: pi.id,
    customerId: typeof pi.customer === "string" ? pi.customer : null,
    metadata: (pi.metadata ?? {}) as Record<string, string>,
  };
}

/**
 * Extracts POS-relevant data from a Stripe Invoice.
 *
 * Called when an `invoice.updated` event arrives. Filters to paid invoices
 * only — the same event fires for draft and open states which we ignore.
 *
 * By the time `invoice.updated` (status=paid) fires, `customer.updated` has
 * already run and `invoice.customer_email` is populated, solving the timing
 * race that affected the `payment_intent.succeeded` path.
 *
 * @param invoice - Invoice object from the Stripe webhook event payload
 * @returns Extracted data object, or null if this invoice should be ignored
 */
export function extractPosFromInvoice(
  invoice: Stripe.Invoice,
): PosPaymentData | null {
  // Only process invoices that have been paid.
  if (invoice.status !== "paid") return null;

  // In Stripe API 2025-05-28.basil, `payment_intent` moved to invoice.payments[]
  // but the field is still present as a string in raw webhook JSON payloads.
  // Cast to access it since the TypeScript types no longer expose it directly.
  const raw = invoice as Stripe.Invoice & { payment_intent?: string | null };
  const paymentIntentId = raw.payment_intent ?? null;

  if (!paymentIntentId) {
    console.warn(
      `[stripe-pos] Invoice ${invoice.id} has no payment_intent — skipping`,
    );
    return null;
  }

  // customer_email is populated by Stripe after customer.updated fires.
  const email = invoice.customer_email ?? null;
  if (!email) {
    console.warn(
      `[stripe-pos] Invoice ${invoice.id} (PI ${paymentIntentId}) has no customer_email — skipping`,
    );
    return null;
  }

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer | null)?.id ?? null;

  return {
    email,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    paymentIntentId,
    customerId,
    metadata: (invoice.metadata ?? {}) as Record<string, string>,
  };
}
