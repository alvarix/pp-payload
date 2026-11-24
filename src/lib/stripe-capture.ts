import type Stripe from "stripe";
import type { Payload, Where } from "payload";
import type { Job } from "@/payload-types";
import { findOrCreateClient } from "@/lib/findOrCreateClient";
import { mapDeliveryMethod } from "@/lib/stripe";

/**
 * Shared Stripe → CRM capture logic.
 *
 * Used by:
 * - the POS webhook (`/api/stripe/pos`) — Terminal / Tap-to-Pay sales
 * - the checkout webhook (`/api/stripe/checkout`) — online Payment Link sales
 * - the intake API (`/api/intake`) — reconciliation of form submissions
 *
 * Every path funnels into one `capturePaymentStub()` so a single Stripe
 * payment can never produce two Job records, whichever producer fires first.
 */

/**
 * Email for POS walk-up sales where no email was captured at the terminal.
 *
 * All email-less sales link to this ONE shared client record. A per-payment
 * fake email (e.g. `unknown-pi_xxx@…`) would fragment the CRM into
 * single-use, unmergeable clients; one shared record stays manageable.
 */
export const WALKUP_CLIENT_EMAIL = "pos-walkup@petportraits.ink";

/** Normalised payment shape shared by both webhooks and the reconcile script. */
export interface CapturePaymentInput {
  /** Customer email if known; null for email-less POS walk-ups. */
  email: string | null;
  amountCents: number;
  currency: string;
  paymentIntentId: string | null;
  checkoutSessionId?: string | null;
  customerId: string | null;
  metadata: Record<string, string>;
  source: "pos" | "website";
}

export interface CaptureResult {
  job: Job | null;
  /** True when a Job already existed for this payment — nothing was created. */
  duplicate: boolean;
}

/**
 * Map Payment Link / Terminal metadata to the Jobs `job_type` enum.
 * Returns undefined for any value we don't recognise — never guesses.
 */
export function resolveJobType(
  metadata: Record<string, string> | undefined | null,
): "street" | "studio" | undefined {
  const raw = metadata?.job_type;
  return raw === "street" || raw === "studio" ? raw : undefined;
}

/**
 * Map metadata to the Jobs `delivery_method` enum.
 * Accepts `pickup`/`delivery` directly, or a free-text value containing a
 * pickup keyword (same heuristic as the checkout prefill path).
 */
export function resolveDeliveryMethod(
  metadata: Record<string, string> | undefined | null,
): "pickup" | "delivery" | undefined {
  const raw = metadata?.delivery_method;
  if (raw === "pickup" || raw === "delivery") return raw;
  return mapDeliveryMethod(raw);
}

/**
 * Find a Job by its Stripe identifiers.
 *
 * Deduping prefers the Payment Intent id (stable across both online and POS
 * flows) and falls back to the Checkout Session id, so a job created by the
 * intake form is found by the webhook (and vice versa) before either creates.
 */
export async function findJobByStripeIds(
  payload: Payload,
  ids: { paymentIntentId?: string | null; checkoutSessionId?: string | null },
): Promise<Job | null> {
  const or: Where[] = [];
  if (ids.paymentIntentId) {
    or.push({ stripe_payment_intent_id: { equals: ids.paymentIntentId } });
  }
  if (ids.checkoutSessionId) {
    or.push({ stripe_checkout_session_id: { equals: ids.checkoutSessionId } });
  }
  if (or.length === 0) return null;

  const found = await payload.find({ collection: "jobs", where: { or }, limit: 1 });
  return (found.docs[0] as Job) ?? null;
}

/**
 * Extract capture data from a Stripe Checkout Session (online payments).
 *
 * Returns null for unpaid sessions — `checkout.session.completed` also fires
 * for `no_payment_required` sessions, which we do record only when paid.
 * (Free checkouts with no charge carry no money to reconcile.)
 */
export function extractCaptureFromSession(
  session: Stripe.Checkout.Session,
): CapturePaymentInput | null {
  if (session.payment_status !== "paid") return null;

  const paymentIntentId =
    session.payment_intent == null
      ? null
      : typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent.id;

  const customerId =
    session.customer == null
      ? null
      : typeof session.customer === "string"
        ? session.customer
        : session.customer.id;

  const email =
    session.customer_details?.email ?? session.customer_email ?? null;

  return {
    email,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    paymentIntentId,
    checkoutSessionId: session.id,
    customerId,
    metadata: (session.metadata ?? {}) as Record<string, string>,
    source: "website",
  };
}

/**
 * Create (or dedupe) a stub Job for a captured Stripe payment.
 *
 * 1. Dedupe by Stripe ids — webhook retries and form/webhook races land here.
 * 2. Find or create the Client — email-less POS sales link to the shared
 *    walk-up placeholder, which is never marketing-mailable.
 * 3. Create the Job stub with a unique-violation catch (23505) as the final
 *    race backstop — the DB unique index on stripe_payment_intent_id.
 *
 * Never throws for business reasons; callers still wrap for 500s.
 */
export async function capturePaymentStub(
  payload: Payload,
  data: CapturePaymentInput,
): Promise<CaptureResult> {
  // ── Dedup ─────────────────────────────────────────────────────────────
  const existing = await findJobByStripeIds(payload, {
    paymentIntentId: data.paymentIntentId,
    checkoutSessionId: data.checkoutSessionId,
  });
  if (existing) {
    return { job: existing, duplicate: true };
  }

  // ── Client ─────────────────────────────────────────────────────────────
  let client;
  if (data.email) {
    client = await findOrCreateClient(payload, { email: data.email });
  } else {
    client = await findOrCreateClient(payload, { email: WALKUP_CLIENT_EMAIL });
    // Placeholder client must never receive marketing email.
    if (client.marketing_consent !== false || client.marketing_status !== "never_asked") {
      client = await payload.update({
        collection: "clients",
        id: client.id,
        data: {
          marketing_consent: false,
          marketing_status: "never_asked",
          consent_basis: "none",
          notes:
            "POS walk-up placeholder — no email captured at terminal. " +
            "Replace with a real client when known.",
        },
      });
    }
  }

  // ── Job stub ───────────────────────────────────────────────────────────
  const notes =
    data.source === "pos"
      ? "[POS sale — intake details pending]"
      : "[Website payment — intake details pending]";

  const jobData = {
    client: client.id,
    source: data.source,
    status: "intake_received" as const,
    notes,
    job_type: resolveJobType(data.metadata),
    delivery_method: resolveDeliveryMethod(data.metadata),
    stripe_checkout_session_id: data.checkoutSessionId ?? undefined,
    stripe_payment_intent_id: data.paymentIntentId ?? undefined,
    stripe_customer_id: data.customerId ?? undefined,
    stripe_amount_paid_cents: data.amountCents,
    stripe_currency: data.currency,
    stripe_payment_status: "paid" as const,
    payment_methods: [
      {
        method: (data.source === "pos" ? "pos" : "website") as "pos" | "website",
        amount: data.amountCents / 100,
        date: new Date().toISOString(),
      },
    ],
    // POS stubs have no pet data; website stubs get pets when the intake form
    // is submitted (reconciled onto this record, not duplicated).
    pets: [],
  };

  try {
    const job = await payload.create({ collection: "jobs", data: jobData });
    return { job, duplicate: false };
  } catch (err) {
    // 23505 = unique_violation. The unique index on stripe_payment_intent_id
    // is the last-line backstop for the webhook/form create race: both
    // passed the dedupe check, one committed first. Re-fetch and report.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      const existingJob = await findJobByStripeIds(payload, {
        paymentIntentId: data.paymentIntentId,
        checkoutSessionId: data.checkoutSessionId,
      });
      if (existingJob) return { job: existingJob, duplicate: true };
    }
    throw err;
  }
}