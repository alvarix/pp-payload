import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import { getStripeClient } from "@/lib/stripe";
import { extractPosPayment } from "@/lib/stripe-pos";
import type { PosPaymentData } from "@/lib/stripe-pos";
import { findOrCreateClient } from "@/lib/findOrCreateClient";
import { sendPosIntakeNotification } from "@/lib/email";

/**
 * POST /api/stripe/pos
 *
 * Handles three Stripe event types:
 *
 * 1. `customer.updated` — primary path. The customer enters their email
 *    after the Terminal tap; this event fires with the email already set.
 *    We search the customer's recent payment intents (last 120s) for a
 *    card_present one and create the record from that.
 *
 * 2. `invoice.updated` (status = paid) — secondary path for invoices where
 *    the email was captured before finalization. Falls back to a Stripe
 *    customer fetch if invoice.customer_email is null.
 *
 * 3. `payment_intent.succeeded` — fallback for charges where receipt_email
 *    is set directly on the PI. Filters to card_present only.
 *
 * All paths share the same dedup check and job-creation logic so a single
 * charge never produces two Job records.
 *
 * Stripe requires a 2xx response for any event we choose not to act on,
 * and a 400 only for signature failures.
 */
export async function POST(request: NextRequest) {
	const secret = process.env.STRIPE_POS_WEBHOOK_SECRET;
	if (!secret) {
		console.error("[stripe-pos] STRIPE_POS_WEBHOOK_SECRET is not configured");
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
		console.warn("[stripe-pos] Signature verification failed:", err);
		return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
	}

	console.log(`[stripe-pos] Received event: ${event.type} (${event.id})`);

	// ── customer.updated (primary path) ─────────────────────────────────────
	// This is the ONLY event that reliably has the email — the customer enters
	// their email after the Terminal tap, which triggers this event. We search
	// the customer's recent payment intents for a card_present one and create
	// the record from that.
	if (event.type === "customer.updated") {
		const stripe = getStripeClient();
		const customer = event.data.object as Stripe.Customer;

		if (!customer.email) {
			console.log(
				`[stripe-pos] Customer ${customer.id} has no email — skipping`,
			);
			return NextResponse.json({ received: true });
		}

		// Find a recent card_present payment intent on this customer.
		// The tap happened within the last 2 minutes.
		const recent = await stripe.paymentIntents.list({
			customer: customer.id,
			limit: 5,
			created: { gte: Math.floor(Date.now() / 1000) - 120 },
		});

		let matchedPi: Stripe.PaymentIntent | null = null;
		for (const pi of recent.data) {
			if (pi.status !== "succeeded") continue;

			// Expand charge to verify card_present
			let charge: Stripe.Charge | null = null;
			if (typeof pi.latest_charge === "string") {
				try {
					charge = await stripe.charges.retrieve(pi.latest_charge);
				} catch {
					continue;
				}
			} else if (pi.latest_charge) {
				charge = pi.latest_charge;
			}

			if (charge?.payment_method_details?.type === "card_present") {
				matchedPi = pi;
				break;
			}
		}

		if (!matchedPi) {
			console.log(
				`[stripe-pos] Customer ${customer.email} updated but no recent card_present PI — skipping`,
			);
			return NextResponse.json({ received: true });
		}

		return createPosRecord({
			email: customer.email,
			amountCents: matchedPi.amount,
			currency: matchedPi.currency,
			paymentIntentId: matchedPi.id,
			customerId: customer.id,
			metadata: (matchedPi.metadata ?? {}) as Record<string, string>,
		});
	}

	// ── invoice.updated (secondary path) ──────────────────────────────────────
	// `customer.updated` fires before this event so the customer has their email
	// by the time we process it — but invoice.customer_email is snapshotted at
	// finalization and stays null if the email was entered after that moment.
	// We fall back to fetching the customer directly from Stripe.
	if (event.type === "invoice.updated") {
		const stripe = getStripeClient();
		// Stripe API 2025-05-28.basil moved payment_intent to invoice.payments[];
		// the field is still present in raw webhook JSON as a string.
		const inv = event.data.object as Stripe.Invoice & {
			payment_intent?: string | null;
		};

		if (inv.status !== "paid") return NextResponse.json({ received: true });

		const piId = inv.payment_intent ?? null;
		if (!piId) {
			console.warn(
				`[stripe-pos] Invoice ${inv.id} has no payment_intent — skipping`,
			);
			return NextResponse.json({ received: true });
		}

		const customerId = typeof inv.customer === "string" ? inv.customer : null;

		// invoice.customer_email is null when email is entered after finalization.
		// Fall back to a live customer fetch — customer.updated has already fired
		// so the email is guaranteed to be there by the time we run.
		let email: string | null = inv.customer_email ?? null;
		if (!email && customerId) {
			try {
				const customer = await stripe.customers.retrieve(customerId);
				if (!customer.deleted) {
					email = (customer as Stripe.Customer).email ?? null;
				}
			} catch (err) {
				console.warn(
					`[stripe-pos] Could not retrieve customer ${customerId}:`,
					err,
				);
			}
		}

		if (!email) {
			console.warn(
				`[stripe-pos] Invoice ${inv.id} has no resolvable email — skipping`,
			);
			return NextResponse.json({ received: true });
		}

		return createPosRecord({
			email,
			amountCents: inv.amount_paid,
			currency: inv.currency,
			paymentIntentId: piId,
			customerId,
			metadata: (inv.metadata ?? {}) as Record<string, string>,
		});
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
			data.metadata?.job_type === "street" ||
			data.metadata?.job_type === "studio"
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
