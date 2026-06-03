import { describe, it, expect, vi } from "vitest";
import { extractPosPayment } from "../stripe-pos";
import type Stripe from "stripe";

/** Minimal card-present PaymentIntent fixture. */
function makeCardPresentPI(overrides: Record<string, unknown> = {}): Stripe.PaymentIntent & {
  latest_charge?: Stripe.Charge | null;
} {
  return {
    id: "pi_test_123",
    amount: 5000,
    currency: "usd",
    receipt_email: "test@example.com",
    customer: "cus_test_456",
    metadata: { job_type: "street" },
    latest_charge: {
      payment_method_details: {
        type: "card_present",
      },
      billing_details: {
        email: null,
      },
    } as unknown as Stripe.Charge,
    ...overrides,
  } as unknown as Stripe.PaymentIntent & { latest_charge?: Stripe.Charge | null };
}

describe("extractPosPayment", () => {
  it("returns data for a valid card-present PaymentIntent", () => {
    const result = extractPosPayment(makeCardPresentPI());

    expect(result).not.toBeNull();
    expect(result?.email).toBe("test@example.com");
    expect(result?.amountCents).toBe(5000);
    expect(result?.currency).toBe("usd");
    expect(result?.paymentIntentId).toBe("pi_test_123");
    expect(result?.customerId).toBe("cus_test_456");
    expect(result?.metadata).toEqual({ job_type: "street" });
  });

  it("returns null when payment_method_details.type is not card_present", () => {
    const pi = makeCardPresentPI({
      latest_charge: {
        payment_method_details: { type: "card" },
        billing_details: { email: null },
      },
    });

    expect(extractPosPayment(pi)).toBeNull();
  });

  it("returns null when latest_charge is missing", () => {
    const pi = makeCardPresentPI({ latest_charge: null });
    expect(extractPosPayment(pi)).toBeNull();
  });

  it("returns null when no email is available and logs a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const pi = makeCardPresentPI({
      receipt_email: null,
      latest_charge: {
        payment_method_details: { type: "card_present" },
        billing_details: { email: null },
      },
    });

    expect(extractPosPayment(pi)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no email"),
    );

    warnSpy.mockRestore();
  });

  it("falls back to billing_details.email when receipt_email is null", () => {
    const pi = makeCardPresentPI({
      receipt_email: null,
      latest_charge: {
        payment_method_details: { type: "card_present" },
        billing_details: { email: "billing@example.com" },
      },
    });

    expect(extractPosPayment(pi)?.email).toBe("billing@example.com");
  });

  it("returns null customerId when customer field is null", () => {
    const pi = makeCardPresentPI({ customer: null });
    expect(extractPosPayment(pi)?.customerId).toBeNull();
  });
});
