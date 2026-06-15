import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPayload } from "payload";
import type { BasePayload } from "payload";
import configPromise from "@payload-config";
import { getStripeClient } from "@/lib/stripe";
import { extractPosPayment, extractPosFromInvoice } from "@/lib/stripe-pos";
import type { PosPaymentData } from "@/lib/stripe-pos";
import { findOrCreateClient } from "@/lib/findOrCreateClient";
import { sendPosIntakeNotification } from "@/lib/email";

/**
 * POST /api/stripe/pos
 *
 * Handles two Stripe event types:
 *
 * 1. `payment_intent.succeeded` — fallback path for charges that carry
 *    receipt_email directly on the payment intent. Filters to card-present
 *    only.
 *
 * 2. `invoice.updated` (status = paid) — primary path for the Terminal
 *    invoice flow. The customer enters their email after the tap, which
 *    triggers customer.updated → invoice.updated(paid) in that order.
 *    By the time this event fires, invoice.customer_email is populated.
 *
 * Both paths share the same dedup check and job-creation logic so a single
 * charge never produces two Job records.
 *
 * Stripe requires a 2xx response for any event we choose not to act on,
 * and a 400 only for signature failures.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_POS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-pos] STRIPE_POS_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Raw body is required for Stripe signature verification — must not parse
  // as JSON before this step.
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn("[stripe-pos] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[stripe-pos] Received event: ${event.type} (${event.id})`);

  // ── invoice.updated (primary path) ────────────────────────────────────────
  // Fires after customer.updated, so customer_email is already populated.
  if (event.type === "invoice.updated") {
    const invoice = event.data.object as Stripe.Invoice;
    const data = extractPosFromInvoice(invoice);
    if (!data) return NextResponse.json({ received: true });
    return createPosRecord(data);
  }

  // ── payment_intent.succeeded (fallback path) ──────────────────────────────
  // Used when receipt_email is on the PI directly. Requires charge expansion
  // to confirm card_present.
  if (event.type === "payment_intent.succeeded") {
    const stripe = getStripeClient();
    let pi = event.data.object as Stripe.PaymentIntent & {
      latest_charge?: Stripe.Charge | string | null;
    };

    // latest_charge arrives as a string ID in raw webhook events — expand it
    // so extractPosPayment can read payment_method_details.type.
    if (typeof pi.latest_charge === "string") {
      try {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        pi = { ...pi, latest_charge: charge };
      } catch (err) {
        console.warn(
          `[stripe-pos] Could not retrieve charge ${pi.latest_charge}:`,
          err,
        );
        pi = { ...pi, latest_charge: null };
      }
    }

    const data = extractPosPayment(
      pi as Stripe.PaymentIntent & { latest_charge?: Stripe.Charge | null },
    );
    if (!data) return NextResponse.json({ received: true });
    return createPosRecord(data);
  }

  // All other event types — return 200 so Stripe doesn't retry.
  return NextResponse.json({ received: true });
}

/**
 * Shared job-creation logic used by both event paths.
 *
 * Includes a dedup check on stripe_payment_intent_id so that if both
 * payment_intent.succeeded and invoice.updated fire for the same charge,
 * only one Job record is created.
 *
 * Returns a NextResponse suitable for returning directly from the POST handler.
 *
 * @param data - Normalised POS payment data from either extract helper
 */
async function createPosRecord(data: PosPaymentData): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config: configPromise });

    // ── Dedup check ──────────────────────────────────────────────────────────
    // Prevents duplicate Jobs when both invoice.updated and
    // payment_intent.succeeded deliver for the same charge.
    const existing = await payload.find({
      collection: "jobs",
      where: { stripe_payment_intent_id: { equals: data.paymentIntentId } },
      limit: 1,
    });

    if (existing.totalDocs > 0) {
      console.log(
        `[stripe-pos] Job already exists for PI ${data.paymentIntentId} — skipping duplicate`,
      );
      return NextResponse.json({ received: true, duplicate: true });
    }

    // ── Find or create client ────────────────────────────────────────────────
    const client = await findOrCreateClient(payload, { email: data.email });

    // ── Create Job stub ──────────────────────────────────────────────────────
    const jobType =
      data.metadata?.job_type === "street" || data.metadata?.job_type === "studio"
        ? (data.metadata.job_type as "street" | "studio")
        : undefined;

    const job = await payload.create({
      collection: "jobs",
      data: {
        client: client.id,
        source: "pos",
        status: "intake_received",
        notes: "[POS sale — intake details pending]",
        job_type: jobType,
        stripe_payment_intent_id: data.paymentIntentId,
        stripe_customer_id: data.customerId ?? undefined,
        stripe_amount_paid_cents: data.amountCents,
        stripe_currency: data.currency,
        stripe_payment_status: "paid",
        payment_methods: [
          {
            method: "pos",
            amount: data.amountCents / 100,
            date: new Date().toISOString(),
          },
        ],
        // pets is intentionally empty — POS stubs have no pet data yet
        pets: [],
      },
    });

    // ── Notify admin ─────────────────────────────────────────────────────────
    try {
      await sendPosIntakeNotification({
        email: data.email,
        jobId: job.id,
        amountCents: data.amountCents,
        paymentIntentId: data.paymentIntentId,
      });
    } catch (emailErr) {
      // Non-fatal — job is already created
      console.error("[stripe-pos] Notification email failed:", emailErr);
    }

    console.log(
      `[stripe-pos] Created job ${job.id} for client ${client.id} (${data.email}) — ${data.amountCents} ${data.currency}`,
    );

    return NextResponse.json({ received: true, jobId: job.id });
  } catch (err) {
    console.error("[stripe-pos] Failed to create job:", err);
    // Return 500 so Stripe retries the delivery
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
