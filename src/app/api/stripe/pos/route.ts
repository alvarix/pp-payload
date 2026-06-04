import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import { getStripeClient } from "@/lib/stripe";
import { extractPosPayment } from "@/lib/stripe-pos";
import { findOrCreateClient } from "@/lib/findOrCreateClient";
import { sendPosIntakeNotification } from "@/lib/email";

/**
 * POST /api/stripe/pos
 *
 * Stripe webhook endpoint for Terminal (POS) payment_intent.succeeded events.
 * Verifies the Stripe signature, filters to card-present charges only,
 * then finds or creates a Client and creates a Job stub.
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

  // Raw body is required for Stripe signature verification — do not parse as
  // JSON before this step.
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn("[stripe-pos] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Only act on payment_intent.succeeded — return 200 for everything else.
  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const stripe = getStripeClient();
  let pi = event.data.object as Stripe.PaymentIntent & {
    latest_charge?: Stripe.Charge | string | null;
  };

  // latest_charge arrives as a string ID in raw webhook events — expand it
  // so extractPosPayment can read payment_method_details.type.
  // Charge lookup can fail in test mode when using a live Stripe key; treat
  // that as a non-fatal skip so real prod events are unaffected.
  if (typeof pi.latest_charge === "string") {
    try {
      const charge = await stripe.charges.retrieve(pi.latest_charge);
      pi = { ...pi, latest_charge: charge };
    } catch (err) {
      console.warn(
        `[stripe-pos] Could not retrieve charge ${pi.latest_charge} — skipping card_present check:`,
        err,
      );
      // Proceed without the charge; extractPosPayment will skip card_present
      // validation and rely solely on receipt_email.
      pi = { ...pi, latest_charge: null };
    }
  }

  const data = extractPosPayment(
    pi as Stripe.PaymentIntent & { latest_charge?: Stripe.Charge | null },
  );

  if (!data) {
    // Not a card-present charge, or email is missing — skip silently.
    return NextResponse.json({ received: true });
  }

  try {
    const payload = await getPayload({ config: configPromise });

    // -- Find or create client -----------------------------------------------
    const client = await findOrCreateClient(payload, { email: data.email });

    // -- Create Job stub ------------------------------------------------------
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

    // -- Notify admin --------------------------------------------------------
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
