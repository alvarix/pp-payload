# Stripe Prefill — Drilldown Plan — 2026-04-21

Parent: `docs/deploy-strategy-2026-04-21.md` Decision 2. Scope: when a paying customer lands on `/intake` via a Stripe Payment Link redirect, prefill fields from the Checkout Session and carry payment identifiers through to the created Job.

Explicitly **out of scope** for this pass:
- Stripe webhook reconciliation / idempotency (`docs/project-review-2026-04-20.md` §B).
- Advanced payment state (refunds, disputes, partial refunds).
- Stripe Customer creation / matching.

Design principle: **fail-open, never block a paying customer from completing intake** — Stripe being down or returning a stale session must degrade gracefully to an empty form.

---

## Current state (facts)

- `src/collections/Jobs.ts` already has:
  - `payment_methods[]` array (`method`, `amount`, `date`) — human-entered, covers POS, cash, Venmo, etc.
  - `stripe_payment_intent_id` text field (line 201).
  - `stripe_customer_id` text field (line 209).
  - `shipping_address` group (line 217).
  - No field for the Checkout Session ID.
  - No field for "amount paid via Stripe" that's distinct from `payment_methods[]`.
- `src/app/(frontend)/intake/page.tsx` currently renders `<IntakeForm />` with no server-side prefill logic. Form page is a client component throughout.
- `src/app/api/intake/route.ts` creates Clients and Jobs from raw form values; does not consume any Stripe fields today.
- `.env.example` has commented-out `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` placeholders.
- No `stripe` package in `package.json` yet.

## What we add

### 1. Schema change: two fields on Jobs

- `stripe_checkout_session_id` — text, indexed. Primary key for reconciling a Job with its originating Checkout Session (and later with webhook events).
- `stripe_amount_paid_cents` — integer. Captured from the session for display on the Job in admin. Doesn't drive any logic — `payment_methods[]` remains the source of truth for totals (so we can add a "website" entry next to existing Venmo/cash rows).

Migration: Payload auto-generates on next boot.

### 2. Env vars (production + preview)

- `STRIPE_SECRET_KEY` — test key locally, live key in Vercel prod env. **Never** committed.
- (Later: `STRIPE_WEBHOOK_SECRET` for the webhook route in a separate pass.)

### 3. Server-side session fetch on `/intake`

Convert `src/app/(frontend)/intake/page.tsx` from pure client render to a server component that:

1. Reads `searchParams.session` from the URL.
2. If present and looks like `cs_...`:
   - Calls `stripe.checkout.sessions.retrieve(id, { expand: ['customer', 'payment_intent'] })`.
   - On success: extracts `customer_details` (email, name, phone, address) and payment identifiers, passes to `<IntakeForm prefill={...} stripe={...} />`.
   - On failure (invalid session, Stripe down, timeout): logs the error server-side and passes `prefill={}` to the form.
3. If absent: passes `prefill={}`.

Timeout the Stripe call at 3s. We'd rather show a blank form than make the paying customer wait 10s for a prefill that didn't arrive.

### 4. `<IntakeForm />` changes

- Accept two new props: `prefill` (object of default field values) and `stripe` (object with `session_id`, `payment_intent_id`, `customer_id`, `amount_paid_cents`).
- Render `defaultValue={prefill.first_name}` etc. on inputs so user can see + edit prefilled values.
- Render four hidden inputs for the `stripe` object, so they POST to `/api/intake` alongside the form.

### 5. `/api/intake` handler changes

- Accept the four `stripe_*` hidden fields.
- On Job create, set `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_customer_id`, `stripe_amount_paid_cents`.
- If `stripe_amount_paid_cents` > 0 **and** `stripe_payment_intent_id` is present, also append to `payment_methods[]`:
  ```
  { method: 'website', amount: stripe_amount_paid_cents / 100, date: today }
  ```
  This keeps the existing payment-history UX working without special-casing Stripe in the dashboard.

### 6. Shipping address prefill

If Stripe returns a shipping address (collect-shipping-address enabled on the Payment Link), mirror it into the Job's `shipping_address` group. The field names differ between Stripe (`line1`, `postal_code`) and our Clients collection (`street1`, `zip`) — but the Jobs shipping group already uses Stripe-style names. Direct pass-through.

---

## Tests

1. **Unit** — pure mapping function `mapStripeSessionToPrefill(session)` returns the expected shape given a known Stripe session object. Lives in `src/app/api/intake/stripe.ts` (new file) or similar, so it's importable without a live Stripe call. Vitest spec at `tests/int/stripe-prefill.int.spec.ts`.
2. **Integration** — `POST /api/intake` with `stripe_session_id=cs_test_foo&stripe_payment_intent_id=pi_test_bar&stripe_amount_paid_cents=12500&stripe_customer_id=cus_test_x`. Assert the created Job has all four fields set and `payment_methods[]` contains a `{ method: 'website', amount: 125, ... }` entry.
3. **E2E** — hit `/intake?session=<stubbed>` in Playwright with a mocked Stripe response. Assert email and name inputs are prefilled. (Alternative if Stripe mocking is painful: skip E2E for prefill, rely on manual test with a real test-mode session.)
4. **Manual** — click through a real Stripe test Payment Link end-to-end in a Vercel preview. Verify the Job in admin shows all four Stripe IDs and one `website` payment entry.

---

## Answers received 2026-04-21

1. **Test-mode access.** No Stripe test secret key yet — user will obtain before execution. Several Payment Links exist; most (not all) will redirect to `/intake`. Links that don't redirect to `/intake` are out of scope for this plan.
2. **Failure policy.** "If Stripe fails payment there is no reason to start intake." Interpretation (confirm before execution):
   - No `session` param in URL → blank open intake (lead capture, unchanged).
   - `session` param present + `payment_status === 'paid'` → prefill as designed.
   - `session` param present + any other state (unpaid, expired session, invalid ID, Stripe API unreachable, timeout) → render a **"Please get in touch"** error page; do not render the form.
   - Implication: unlike my earlier "fail-open to blank form" plan, `session` presence is a signal of paid-customer intent and a verification failure is treated as a hard error. This is stricter and matches "mission critical" posture.
3. **What to capture.** User asked for a menu — see §"Stripe data menu" below. User picks the fields; the plan is updated to capture exactly those.
4. **Shipping / address cascade.** If Stripe returns a shipping address → always write to Job `shipping_address`. Client `address` is back-filled when empty, **preferring Stripe billing address** if present over shipping. So:
   - Job `shipping_address` ← Stripe `shipping_details.address` (if present).
   - Client `address` (when currently empty) ← Stripe `customer_details.address` (billing) if present, else `shipping_details.address`, else leave empty.
   - If Client `address` is already populated, do not overwrite (user's existing data wins).
5. **Error visibility.** Server logs only. No admin-visible `prefill_errors` collection.

## Stripe data menu (user: pick the ones to capture)

Everything below is retrievable from one `stripe.checkout.sessions.retrieve(id, { expand: ['customer', 'payment_intent.latest_charge', 'line_items'] })` call. I've grouped by utility and recommended (✓) or flagged optional (~) choices. Reply with keeps, drops, and any additions.

### Identifiers (recommended keep — free; necessary for later webhook reconciliation)

| Field | Source | Why keep |
|---|---|---|
| ✓ `stripe_checkout_session_id` | `session.id` (`cs_...`) | Primary key to look this session back up in Stripe dashboard or via webhook |
| ✓ `stripe_payment_intent_id` | `session.payment_intent` (`pi_...`) | Matches to future charge/refund webhooks. Already exists on Jobs. |
| ✓ `stripe_customer_id` | `session.customer` (`cus_...`) | Match returning customers. Already exists on Jobs. |
| ~ `stripe_client_reference_id` | `session.client_reference_id` | Only useful if we set it on the link (e.g., WP order ID). Skip until needed. |

### Money (recommended keep — needed for dashboard totals)

| Field | Source | Why keep |
|---|---|---|
| ✓ `stripe_amount_paid_cents` | `session.amount_total` | Actual amount paid, in cents. Drives the `payment_methods[]` `website` row. |
| ✓ `stripe_currency` | `session.currency` | Needed for correct display (`$`/`€`). Three-letter lowercase, e.g. `usd`. |
| ~ `stripe_amount_subtotal_cents` | `session.amount_subtotal` | Pre-tax. Only matters if we ever show tax breakdown. |
| ~ `stripe_amount_tax_cents` | `session.total_details.amount_tax` | Same — skip unless showing tax. |
| ~ `stripe_amount_discount_cents` | `session.total_details.amount_discount` | Same — skip unless showing discounts. |

### Payment state (recommended keep — needed for the failure-policy check)

| Field | Source | Why keep |
|---|---|---|
| ✓ `stripe_payment_status` | `session.payment_status` | `'paid'` / `'unpaid'` / `'no_payment_required'`. Drives the "block intake" logic. |
| ~ `stripe_session_status` | `session.status` | `'complete'` / `'open'` / `'expired'`. Mostly redundant with payment_status. |
| ~ `stripe_payment_method_types` | `session.payment_method_types` | `['card']`. Only useful if we want "paid via card / ACH" display. |

### Receipt / audit trail (optional but cheap)

| Field | Source | Why keep |
|---|---|---|
| ~ `stripe_receipt_url` | `payment_intent.latest_charge.receipt_url` | Link directly to the Stripe-hosted receipt from the admin Job page. Nice for support. |
| ~ `stripe_session_created_at` | `session.created` (unix → Date) | When they paid. `Job.createdAt` is when the intake form was submitted, which is close but not identical. |

### Products (optional — only if Payment Links sell distinct SKUs)

| Field | Source | Why keep |
|---|---|---|
| ~ `stripe_line_items` | `line_items.data` (expanded) | Array of `{ description, amount_total, quantity, price_id }`. Only matters if you want to know which SKU/tier they bought. |

### Contact / address (used to prefill form, not all stored on Job)

| Field | Source | Use |
|---|---|---|
| ✓ customer email | `customer_details.email` | Prefill form; matches existing Client by email on `/api/intake`. |
| ✓ customer name | `customer_details.name` | Prefill `first_name` + `last_name` (we'll split on space). |
| ✓ customer phone | `customer_details.phone` | Prefill phone. |
| ✓ billing address | `customer_details.address` | Prefill (and backfill Client address per Q4). |
| ✓ shipping name/address | `shipping_details.name` + `.address` | Write to Job `shipping_address`. |

---

**My recommendation:** accept all ✓ fields as marked. Skip the `~` fields unless you want them. Reply with "all ✓" or list-by-exception.

### Final field picks (extrapolated from user's 2026-04-21 list)

User said: total paid, all contact info, which payment link was used (auto-fill job-type), coupons, delivery or pickup. Extrapolated to concrete fields:

**New fields on Jobs** (beyond the already-existing `stripe_payment_intent_id`, `stripe_customer_id`, `shipping_address`):

| Field | Type | Source | Purpose |
|---|---|---|---|
| `stripe_checkout_session_id` | text (indexed) | `session.id` | Reconciliation anchor for later webhook work |
| `stripe_payment_link_id` | text (indexed) | `session.payment_link` | Which link was used — drives `job_type` auto-fill |
| `stripe_amount_paid_cents` | integer | `session.amount_total` | Total paid |
| `stripe_currency` | text, default `usd` | `session.currency` | For correct money display |
| `stripe_payment_status` | text | `session.payment_status` | Drives the fail-closed block logic + audit |
| `stripe_amount_discount_cents` | integer, default 0 | `session.total_details.amount_discount` | Coupon savings |
| `stripe_discount_codes` | array of text | `session.discounts` (expanded → coupon.name or promotion_code.code) | Which coupon(s) used |

**Auto-fills to existing Jobs fields** (driven by Payment Link config):

| Field | Source | How |
|---|---|---|
| `job_type` | Payment Link `metadata.job_type` | You set `metadata.job_type = 'street'` or `'studio'` on the Payment Link in Stripe dashboard. Session inherits it; we map directly. Falls back to unset if missing. |
| `delivery_method` | Payment Link `metadata.delivery_method` **or** session custom field | Two options — see below. |

**Delivery vs pickup — two options, you pick:**

- **Option A: fixed per Payment Link.** Set `metadata.delivery_method = 'pickup'` (or `'delivery'`) on each Payment Link. Simplest for you; no per-order customer choice. Best if you have separate "Pickup" and "Delivery" Payment Links.
- **Option B: customer chooses at checkout.** Add a Stripe "custom field" to each Payment Link ("How would you like to receive this? [Pickup / Delivery]"). This appears on the Stripe checkout page; the answer comes back in `session.custom_fields[]`. More flexible but requires customer action.

I recommend **Option A** if your links are already segmented by delivery method. Otherwise **B**. Note either way.

**Contact + address (for form prefill + Client back-fill, not all stored on Job):**
- email, name (split on space → first/last), phone → form prefill
- billing address (`customer_details.address`) → prefill + back-fills `Client.address` when empty
- shipping address (`shipping_details.address`) → writes to `Job.shipping_address`; also back-fills `Client.address` if billing is absent and Client has none

---

## What you'll set up in Stripe (one-time, before execution)

For each active Payment Link you want to redirect to `/intake`:

1. **Success URL:** `https://<your-domain>/intake?session={CHECKOUT_SESSION_ID}` (and `https://<vercel-preview>/intake?session={CHECKOUT_SESSION_ID}` on the test-mode equivalent).
2. **Enable:** "Collect customer's phone number" + "Collect shipping address".
3. **Metadata:**
   - `job_type`: `street` or `studio`
   - `delivery_method` (if Option A): `pickup` or `delivery`
4. **Custom fields** (if Option B): add a radio/dropdown question "Pickup or Delivery?" with values `pickup` / `delivery`.
5. **Test key:** Stripe dashboard → Developers → API keys → "Reveal test key" → paste into local `.env` as `STRIPE_SECRET_KEY=sk_test_...` (never commit).

---

## Execution order and estimates

Each step ends in a small commit and a test. Stop and re-check before moving on if anything surprises us.

**Legend.** "AI min" = my active working time per step (tool calls + code generation + test runs). "User min" = your active time (reviewing code, responding to prompts, manual tests). "Tokens" = rough total for the step (input + output through my context), in thousands. All estimates are **90% bands** — individual steps can run +/-50% based on surprises.

| # | Task | Files | Test | AI min | User min | Tokens (K) |
|---|---|---|---|---|---|---|
| 0 | **User prep:** obtain Stripe test key, configure each relevant Payment Link (success URL, metadata, collect phone/address) | Stripe dashboard | Click-through test Payment Link → lands on `/intake?session=cs_test_...` | — | 30–45 | 0 |
| 1 | Add `stripe` npm dep | `package.json`, `pnpm-lock.yaml` | `pnpm dev` boots; `tsc --noEmit` clean | 2 | 1 | 5 |
| 2 | Add 7 new `stripe_*` fields to Jobs; run `payload generate migration`; apply to Supabase | `src/collections/Jobs.ts`, new migration | Migration applies clean on Supabase; admin Job edit shows new fields | 10 | 5 | 25 |
| 3 | Create `src/lib/stripe.ts` with `getSessionPrefill(sessionId)` — handles success, failed payment, expired, Stripe unreachable, timeout (3s) | new file, new `tests/int/stripe-prefill.int.spec.ts` | Unit tests pass: `paid` → prefill; `unpaid` → error; invalid ID → error; fetch rejects → error | 15 | 5 | 40 |
| 4 | Convert `intake/page.tsx` to server component; call `getSessionPrefill`; render error UI when verification fails | `intake/page.tsx`, new `intake/StripeError.tsx` | Manual: visit `/intake?session=cs_test_invalid` → see "please contact us" error page | 10 | 5 | 25 |
| 5 | `<IntakeForm />` accepts `prefill` + `stripe` props; renders `defaultValue` + hidden fields | `IntakeForm.tsx` | DOM snapshot confirms prefilled values + 7 hidden fields present | 15 | 5 | 35 |
| 6 | `/api/intake` reads hidden `stripe_*` fields, validates, sets on Job; auto-fills `job_type` / `delivery_method` from metadata; address cascade to Client | `api/intake/route.ts`, new `tests/int/intake-stripe.int.spec.ts` | Integration test posting Stripe form → Job has all 7 fields + correct `job_type` + `payment_methods[]` row | 15 | 5 | 40 |
| 7 | Manual walkthrough on Vercel preview with real test Payment Link | Vercel dashboard | End-to-end: test Payment Link → `/intake` prefilled → submit → Job in admin correct | 10 | 30–45 | 15 |

**Stripe pass totals:** AI ~77 min, User ~90–120 min (incl. step 0 prereq), Tokens ~185 K.

Your time is dominated by step 0 (Stripe setup) and step 7 (end-to-end verification); everything in between is short review cycles. If you want me to keep moving without per-step check-ins, say so and I'll batch reviews at steps 2, 5, and 7 instead.

---

## Iteration

_(User updates as questions get answered.)_

- 2026-04-21 — Q1–Q5 answered. Stripe data menu replied: total paid, all contact info, payment link → job_type, coupons, delivery/pickup. Extrapolated into 7 new Jobs fields + 2 auto-fills.
- 2026-04-21 — Estimates added: ~77 min AI, ~90–120 min user, ~185 K tokens for the full Stripe pass.
- _pending: user picks Option A or B for delivery-method source; user picks "per-step review" vs. "batched review at steps 2, 5, 7"; user completes step 0 (Stripe test key + Payment Link metadata)._
