import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
	extractCaptureFromSession,
	resolveJobType,
	resolveDeliveryMethod,
	WALKUP_CLIENT_EMAIL,
} from "../stripe-capture";

/** Minimal paid Checkout Session fixture. */
function makeSession(
	overrides: Record<string, unknown> = {},
): Stripe.Checkout.Session {
	return {
		id: "cs_test_123",
		object: "checkout.session",
		payment_status: "paid",
		amount_total: 15000,
		currency: "usd",
		payment_intent: "pi_test_456",
		customer: "cus_test_789",
		customer_details: { email: "buyer@example.com" },
		metadata: { job_type: "street", delivery_method: "pickup" },
		...overrides,
	} as unknown as Stripe.Checkout.Session;
}

describe("extractCaptureFromSession", () => {
	it("returns capture data for a paid session", () => {
		const result = extractCaptureFromSession(makeSession());

		expect(result).not.toBeNull();
		expect(result?.email).toBe("buyer@example.com");
		expect(result?.amountCents).toBe(15000);
		expect(result?.currency).toBe("usd");
		expect(result?.paymentIntentId).toBe("pi_test_456");
		expect(result?.checkoutSessionId).toBe("cs_test_123");
		expect(result?.customerId).toBe("cus_test_789");
		expect(result?.source).toBe("website");
	});

	it("returns null for an unpaid session", () => {
		expect(extractCaptureFromSession(makeSession({ payment_status: "unpaid" }))).toBeNull();
	});

	it("returns null for a no_payment_required session", () => {
		expect(
			extractCaptureFromSession(makeSession({ payment_status: "no_payment_required" })),
		).toBeNull();
	});

	it("resolves expanded payment_intent / customer objects to their ids", () => {
		const result = extractCaptureFromSession(
			makeSession({
				payment_intent: { id: "pi_expanded" },
				customer: { id: "cus_expanded" },
			}),
		);
		expect(result?.paymentIntentId).toBe("pi_expanded");
		expect(result?.customerId).toBe("cus_expanded");
	});

	it("falls back to customer_email when customer_details is absent", () => {
		const result = extractCaptureFromSession(
			makeSession({ customer_details: null, customer_email: "legacy@example.com" }),
		);
		expect(result?.email).toBe("legacy@example.com");
	});

	it("keeps email null when the session has none", () => {
		const result = extractCaptureFromSession(
			makeSession({ customer_details: null, customer_email: null }),
		);
		expect(result?.email).toBeNull();
	});
});

describe("resolveJobType / resolveDeliveryMethod", () => {
	it("accepts street/studio job types and rejects anything else", () => {
		expect(resolveJobType({ job_type: "street" })).toBe("street");
		expect(resolveJobType({ job_type: "studio" })).toBe("studio");
		expect(resolveJobType({ job_type: "mystery" })).toBeUndefined();
		expect(resolveJobType(undefined)).toBeUndefined();
	});

	it("accepts pickup/delivery and matches free-text pickup keywords", () => {
		expect(resolveDeliveryMethod({ delivery_method: "pickup" })).toBe("pickup");
		expect(resolveDeliveryMethod({ delivery_method: "delivery" })).toBe("delivery");
		expect(resolveDeliveryMethod({ delivery_method: "Local Pickup" })).toBe("pickup");
		expect(resolveDeliveryMethod({ delivery_method: "standard shipping" })).toBe("delivery");
		expect(resolveDeliveryMethod(undefined)).toBeUndefined();
	});

	it("exposes the shared walk-up placeholder email", () => {
		// One constant, not per-payment fakes — per-payment placeholder emails
		// would fragment the CRM into unmergeable single-use clients.
		expect(WALKUP_CLIENT_EMAIL).toBe("pos-walkup@petportraits.ink");
	});
});