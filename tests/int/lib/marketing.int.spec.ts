/**
 * Unit tests for the marketing eligibility rule.
 *
 * This predicate is the send gate, so the tests deliberately pin the cases
 * where consent and status disagree. Those are the rows that decide whether a
 * real email goes out.
 */

import { describe, it, expect } from "vitest";
import { isSendable, statusFromConsent, MARKETING_STATUSES } from "@/lib/marketing";

describe("isSendable", () => {
	it("allows consent given and status subscribed", () => {
		expect(
			isSendable({ marketing_consent: true, marketing_status: "subscribed" }),
		).toBe(true);
	});

	it("rejects a subscribed status without consent", () => {
		// Belt and braces: clearing consent in the admin must suppress even if
		// nobody updated the status.
		expect(
			isSendable({ marketing_consent: false, marketing_status: "subscribed" }),
		).toBe(false);
	});

	it("rejects consent given but status never asked", () => {
		expect(
			isSendable({ marketing_consent: true, marketing_status: "never_asked" }),
		).toBe(false);
	});

	it("rejects every suppression state, even with consent", () => {
		for (const status of ["unsubscribed", "bounced", "complained"] as const) {
			expect(isSendable({ marketing_consent: true, marketing_status: status })).toBe(
				false,
			);
		}
	});

	it("rejects a missing status", () => {
		expect(isSendable({ marketing_consent: true })).toBe(false);
		expect(isSendable({ marketing_consent: true, marketing_status: null })).toBe(
			false,
		);
	});

	it("rejects an unknown status string", () => {
		expect(
			isSendable({ marketing_consent: true, marketing_status: "typo" }),
		).toBe(false);
	});

	it("rejects an empty record", () => {
		expect(isSendable({})).toBe(false);
	});
});

describe("statusFromConsent", () => {
	it("maps consent to subscribed", () => {
		expect(statusFromConsent(true)).toBe("subscribed");
	});

	it("maps no consent to never asked", () => {
		expect(statusFromConsent(false)).toBe("never_asked");
	});

	it("maps nullish to never asked", () => {
		expect(statusFromConsent(null)).toBe("never_asked");
		expect(statusFromConsent(undefined)).toBe("never_asked");
	});
});

describe("MARKETING_STATUSES", () => {
	it("has no duplicate values", () => {
		expect(new Set(MARKETING_STATUSES).size).toBe(MARKETING_STATUSES.length);
	});

	it("contains the five documented states", () => {
		expect([...MARKETING_STATUSES]).toEqual([
			"never_asked",
			"subscribed",
			"unsubscribed",
			"bounced",
			"complained",
		]);
	});
});
