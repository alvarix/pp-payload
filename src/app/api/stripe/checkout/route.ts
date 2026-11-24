import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import { getStripeClient } from "@/lib/stripe";
import {
	extractCaptureFromSession,
	capturePaymentStub,
} from "@/lib/stripe-capture";

/**
 * POST /api/stripe/checkout
 *
 * Webhook for ONLINE Stripe payments (Payment Links / Checkout Sessions).
 * Kept separate from `/api/stripe/pos` on purpose: different event sources,
 * different signing secret (`STRIPE_CHECKOUT_WEBHOOK_SECRET`), so a bug in
 * one endpoint can never take down capture for the other.
 *
 * Events handled:
 * - `checkout.session.completed` — payment_status === "paid" → create the
 *   stub Job. Unpaid / no_payment_required sessions return 200 untouched.
 *
 * All other event types return 200 so Stripe does not retry them.
 *
 * This is the backstop for the case where a customer pays online but never
 * submits the intake form: previously those transactions produced no CRM
 * record at all. When the form IS later submitted, `/api/intake`
 * reconciles onto the stub this webhook created (no duplicate Job).
 */
export async function POST(request: NextRequest) {
	const secret = process.env.STRIPE_CHECKOUT_WEBHOOK_SECRET;
	if (!secret) {
		console.error(
			"[stripe-checkout] STRIPE_CHECKOUT_WEBHOOK_SECRET is not configured",
		);
		return NextResponse.json(
			{ error: "Server misconfiguration" },
			{ status: 500 },
		);
	}

	// Raw body is required for Stripe signature verification — must not parse
	// as JSON before this step.
	const rawBody = await request.text();
	const sig = request.headers.get("stripe-signature") ?? "";

	let event: Stripe.Event;
	try {
		event = getStripeClient().webhooks.constructEvent(rawBody, sig, secret);
	} catch (err) {
		console.warn("[stripe-checkout] Signature verification failed:", err);
		return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
	}

	console.log(`[stripe-checkout] Received event: ${event.type} (${event.id})`);

	if (event.type !== "checkout.session.completed") {
		return NextResponse.json({ received: true });
	}

	const session = event.data.object as Stripe.Checkout.Session;

	try {
		const data = extractCaptureFromSession(session);
		if (!data) {
			// payment_status !== "paid" — nothing captured, nothing owed.
			console.log(
				`[stripe-checkout] Session ${session.id} not paid (${session.payment_status}) — skipping`,
			);
			return NextResponse.json({ received: true });
		}

		const payload = await getPayload({ config: configPromise });
		const { job, duplicate } = await capturePaymentStub(payload, data);

		if (duplicate) {
			console.log(
				`[stripe-checkout] Job ${job?.id} already exists for session ${session.id} — skipping duplicate`,
			);
			return NextResponse.json({ received: true, duplicate: true });
		}

		console.log(
			`[stripe-checkout] Created job ${job?.id} from session ${session.id} (${data.amountCents} ${data.currency})`,
		);
		return NextResponse.json({ received: true });
	} catch (err) {
		// Fail-open: 500 makes Stripe retry, which is safe — capturePaymentStub
		// dedupes. Log loudly so the failure is visible in Vercel.
		console.error("[stripe-checkout] capture failed:", err);
		return NextResponse.json(
			{ error: "Capture failed" },
			{ status: 500 },
		);
	}
}