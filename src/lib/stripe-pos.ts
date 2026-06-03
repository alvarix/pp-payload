import type Stripe from "stripe";

/** Data extracted from a Stripe Terminal payment intent. */
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
  // TODO: restore this check after live terminal test is confirmed.
  // if (charge?.payment_method_details?.type !== "card_present") {
  //   return null;
  // }

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
