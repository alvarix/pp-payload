# Stripe POS Auto-Record — Spec
**Date:** 2026-06-03
**Status:** Spec only — not started

---

## Problem

In-person (POS) sales via Stripe Terminal generate a charge but have no equivalent to
the website checkout → `/intake` form flow. Result: a sale happens, money is captured,
and nothing appears in the CRM unless you manually enter it.

You only have three data points at point-of-sale:
- **Amount** (charged, in cents)
- **Stripe Payment Intent ID** (`pi_...`)
- **Email** (optional — entered on the terminal or attached to a Stripe Customer)

Goal: a Stripe Terminal payment that completes should automatically:
1. Find or create a **Client** record by email
2. Create a **Job** record linked to that client with status `intake_received` and a
   `pos` entry in `payment_methods[]`

No intake form is shown. The record is a stub — enough to track the sale and follow up.

---

## Approach — Stripe Webhook

Stripe Terminal fires a `payment_intent.succeeded` event when a card-present charge
completes. We add a webhook endpoint that:

1. Verifies the Stripe signature (same pattern as the existing website webhook — uses
   `STRIPE_WEBHOOK_SECRET`, or a separate `STRIPE_POS_WEBHOOK_SECRET` if you want to
   route Terminal events to a different endpoint).
2. Filters to Terminal payments only (checks
   `payment_intent.latest_charge.payment_method_details.type === 'card_present'`).
3. Extracts email, amount, currency, and Stripe IDs.
4. Finds or creates a `Client` by email (same logic as `/api/intake`).
5. Creates a `Job` with payment pre-populated and a `[pos_pending_intake]` note.
6. Sends the same intake notification email so you know a new sale landed.

---

## Data Available from Stripe Terminal

| Field | Source | Used for |
|---|---|---|
| `payment_intent.id` | `pi_...` | `stripe_payment_intent_id` on Job |
| `payment_intent.amount` | cents | `payment_methods[0].amount` on Job |
| `payment_intent.currency` | `usd` | `stripe_currency` on Job |
| `payment_intent.receipt_email` | email typed at terminal | Client lookup / create |
| `payment_intent.customer` | `cus_...` (if you attached one) | `stripe_customer_id` on Job |
| `payment_intent.metadata` | key/value you set at charge time | optional job_type, notes |
| `payment_intent.latest_charge.payment_method_details.type` | `card_present` | filter — confirms it's a POS charge |

**What you do NOT get automatically:**
- First/last name (only email)
- Pet info, job type, delivery method
- Reference photos

Those stay blank — the created Job is a stub you complete later (or the client fills in
a follow-up intake link you email them).

---

## Schema Changes

### `Jobs` collection

- Add `source` select field: `website` / `pos` / `manual`. Defaults to `website` so
  existing records read correctly.
- Relax `pets` array `minRows` from `1` to `0`.

All other needed fields already exist on `Jobs`:
- `stripe_payment_intent_id` ✓
- `stripe_customer_id` ✓
- `stripe_currency` ✓
- `stripe_amount_paid_cents` ✓
- `stripe_payment_status` ✓
- `payment_methods[]` with `pos` option ✓
- `status` → will set to `intake_received` ✓

The only open question is whether to add a `source` field to `Jobs` to distinguish
`website` vs `pos` vs `manual` origin. Currently derivable from `payment_methods[0].method`,
but an explicit field is cleaner. **Recommend adding it (see open questions).**

---

## New Files

| File | Purpose |
|---|---|
| `src/app/api/stripe/pos/route.ts` | Webhook handler for Terminal `payment_intent.succeeded` |
| `src/lib/stripe-pos.ts` | Pure mapping helpers (testable without HTTP) |
| `src/lib/__tests__/stripe-pos.test.ts` | Unit tests for mapping helpers |

---

## Modified Files

| File | Change |
|---|---|
| `src/lib/email.ts` | Add `sendPosIntakeNotification()` (or reuse existing with a flag) |
| `.env.example` | Add `STRIPE_POS_WEBHOOK_SECRET` placeholder |

---

## Execution Steps

### Step 0 — User prep (Stripe dashboard, 15–20 min your time)

1. **Enable a webhook endpoint** in Stripe dashboard →
   Developers → Webhooks → Add endpoint:
   - URL: `https://<your-domain>/api/stripe/pos`
   - Events to listen for: `payment_intent.succeeded`
   - (Optionally filter to Terminal only — Stripe doesn't have a UI filter, so we
     do it in code)
2. Note the **Signing Secret** (`whsec_...`) — add as `STRIPE_POS_WEBHOOK_SECRET` in
   Vercel env vars and local `.env`.
3. **Optional:** on your Stripe Terminal charge calls, set
   `metadata: { job_type: 'street' }` so the webhook can auto-fill job type.
4. Test with Stripe CLI: `stripe trigger payment_intent.succeeded --override
   payment_intent:payment_method=pm_card_present_visa`

---

### Step 1 — Webhook endpoint + signature verification (20 min AI / 10 min user)

**File:** `src/app/api/stripe/pos/route.ts`

```
POST /api/stripe/pos
```

- Read raw body (required for Stripe signature check — cannot parse as JSON first)
- Verify with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_POS_WEBHOOK_SECRET)`
- Return 400 on bad signature, 200 on unhandled event type (Stripe expects 2xx)
- Only act on `payment_intent.succeeded`

**Test:** POST with a bad signature → 400. POST with wrong event type → 200 no-op.

---

### Step 2 — Filter + extract POS data (10 min AI / 5 min user)

**File:** `src/lib/stripe-pos.ts`

Pure function `extractPosPayment(paymentIntent)` that:

1. Checks `latest_charge.payment_method_details.type === 'card_present'` — if not,
   returns `null` (not a terminal payment, ignore).
2. Returns `{ email, amountCents, currency, paymentIntentId, customerId, metadata }`.

**Test:** card_present PI → returns data. Non-card_present PI → returns null.

---

### Step 3 — Find or create Client (10 min AI / 5 min user)

Same `find-by-email → create-if-missing` logic already in `/api/intake/route.ts`.
Extract as a shared helper `src/lib/findOrCreateClient.ts` so both routes use it.

If email is absent (terminal charge with no email collected): skip record creation
entirely and log a server-side warning. No client, no job created.

---

### Step 4 — Create Job stub (10 min AI / 5 min user)

```typescript
await payload.create({
  collection: 'jobs',
  data: {
    client: client.id,
    status: 'intake_received',
    notes: '[POS sale — intake details pending]',
    stripe_payment_intent_id: data.paymentIntentId,
    stripe_customer_id: data.customerId ?? undefined,
    stripe_amount_paid_cents: data.amountCents,
    stripe_currency: data.currency,
    stripe_payment_status: 'paid',
    job_type: data.metadata?.job_type,   // if you set metadata on the terminal charge
    payment_methods: [{
      method: 'pos',
      amount: data.amountCents / 100,
      date: new Date().toISOString(),
    }],
    pets: [], // minRows relaxed to 0 — POS stubs have no pet data
  },
})
```

**Test:** Integration test — POST a simulated `payment_intent.succeeded` → Job exists
in DB with correct `payment_methods` and `stripe_payment_intent_id`.

---

### Step 5 — Email notification (5 min AI / 3 min user)

Reuse or extend `sendIntakeNotification()` with a `source: 'pos'` flag that changes
the subject line to `[POS Sale] New job created` vs `[Intake] New job received`.

---

### Step 6 — Tests (15 min AI / 10 min user)

| Test | Type | File |
|---|---|---|
| `extractPosPayment` with card_present PI | unit | `stripe-pos.test.ts` |
| `extractPosPayment` with non-terminal PI returns null | unit | `stripe-pos.test.ts` |
| Bad webhook signature → 400 | integration | `pos-webhook.test.ts` |
| Valid event, no email → placeholder client created | integration | `pos-webhook.test.ts` |
| Valid event, known email → existing client found | integration | `pos-webhook.test.ts` |
| Valid event → Job has pos payment method entry | integration | `pos-webhook.test.ts` |

---

### Step 7 — Deploy + manual test (10 min AI / 20 min user)

1. Deploy to Vercel preview.
2. Use Stripe CLI to replay a real Terminal `payment_intent.succeeded` event at the
   preview URL.
3. Confirm Client + Job appear in admin with correct values.
4. Confirm notification email arrives.

---

## Decisions (2026-06-03)

1. **No-email POS sales:** skip record entirely, log a server-side warning. No placeholder client.
2. **Job `source` field:** add `source` select (`website` / `pos` / `manual`) to Jobs collection.
3. **Webhook secret:** reuse existing `STRIPE_WEBHOOK_SECRET` (same endpoint family, no separate secret needed).
4. **Pets `minRows`:** relax to 0 on Jobs. POS stubs will have an empty pets array.
5. **Follow-up intake link:** out of scope, not needed.

---

## Time Estimates

| # | Task | AI min | Your min |
|---|---|---|---|
| 0 | Stripe dashboard setup (webhook endpoint + signing secret) | — | 15–20 |
| 1 | Webhook endpoint + signature verification | 20 | 10 |
| 2 | `extractPosPayment` helper + filter | 10 | 5 |
| 3 | `findOrCreateClient` shared helper | 10 | 5 |
| 4 | Job stub creation | 10 | 5 |
| 5 | Email notification | 5 | 3 |
| 6 | Unit + integration tests | 15 | 10 |
| 7 | Deploy + manual test | 10 | 20 |
| **Total** | | **~80 min** | **~73–78 min** |

Your time is split roughly: 20 min Stripe setup, 38 min code review, 20 min manual testing.

---

## Explicitly Out of Scope (this pass)

- Refund handling (`charge.refunded` webhook)
- Partial payments / split tender
- Follow-up intake link emailed to client
- Stripe Customer creation at point of sale (that's a Stripe Terminal SDK concern, not CRM)
- Dashboard UI for "POS sales needing follow-up"
