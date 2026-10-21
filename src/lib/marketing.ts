/**
 * Marketing eligibility rules.
 *
 * Kept out of the export route so the same predicate can be reused by the
 * eblast hand-off path and, later, by the Resend recipient resolver. A consent
 * rule that exists in two places is a consent rule that will eventually be
 * enforced in one place.
 */

/**
 * Every value `Clients.marketing_status` can hold.
 *
 * - `never_asked` - no opt-in recorded; do not email.
 * - `subscribed` - opted in and not since suppressed.
 * - `unsubscribed` - the person asked to stop. Legal instruction, never retry.
 * - `bounced` - the address is dead. Not a choice; retrying damages the sender.
 * - `complained` - the person marked the mail as spam. The most urgent state.
 */
export const MARKETING_STATUSES = [
	"never_asked",
	"subscribed",
	"unsubscribed",
	"bounced",
	"complained",
] as const;

/** A single marketing status value. */
export type MarketingStatus = (typeof MARKETING_STATUSES)[number];

/**
 * Statuses that revoke consent and block sending.
 *
 * Module-private so `isSuppressed` is the only way to ask the question, which
 * keeps the collection hook and the send rule in agreement.
 */
const SUPPRESSED_STATUSES: readonly MarketingStatus[] = [
	"unsubscribed",
	"bounced",
	"complained",
];

/**
 * Whether a status suppresses sending.
 *
 * @param status - a marketing status, or nullish
 * @returns true when the address must not receive marketing email
 */
export function isSuppressed(status: string | null | undefined): boolean {
	return (
		status != null &&
		(SUPPRESSED_STATUSES as readonly string[]).includes(status)
	);
}

/** The minimum client shape the eligibility rule needs. */
export interface MarketingEligible {
	marketing_consent?: boolean | null;
	marketing_status?: string | null;
}

/**
 * Whether a client may receive marketing email.
 *
 * Two conditions, both required:
 *   1. `marketing_status === "subscribed"` - the current delivery state.
 *   2. `marketing_consent === true` - the recorded opt-in.
 *
 * Both, rather than status alone, so that clearing consent in the admin panel
 * suppresses a client immediately without anyone having to also remember to
 * change the status. The two fields disagree only when someone has corrected
 * one of them, and in that case the safe answer is "do not email".
 *
 * @param client - any record carrying the consent and status fields
 * @returns true only when both the opt-in and the current state allow sending
 */
export function isSendable(client: MarketingEligible): boolean {
	return (
		client.marketing_consent === true &&
		client.marketing_status === "subscribed"
	);
}

/**
 * The status a client should carry given their recorded consent.
 *
 * Used to backfill `marketing_status` from the pre-existing `marketing_consent`
 * checkbox, and safe to call on any record that has only a consent flag.
 *
 * @param consent - the recorded opt-in flag
 * @returns `subscribed` when consent was given, otherwise `never_asked`
 */
export function statusFromConsent(
	consent: boolean | null | undefined,
): MarketingStatus {
	return consent === true ? "subscribed" : "never_asked";
}
