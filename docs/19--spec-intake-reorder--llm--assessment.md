# Intake Reorder Assessment — 2026-07-09

**Question**: What changes are needed to put the intake form BEFORE the Stripe
payment link?

**Current flow**: WP Checkout → Stripe Payment Link → `/intake?session=cs_...` →
intake form (prefilled, payment-verified) → Job created with all Stripe fields.

**Proposed flow**: WP Checkout → intake form → Stripe payment → Job updated
with payment info.

---

## 1. What the current flow gives us (and what we lose by reordering)

### What works today

| Capability | How it works |
| --- | --- |
| Payment verification BEFORE form submission | `page.tsx` calls `getSessionPrefill(sessionId)` server-side; blocks form if `payment_status !== 'paid'` |
| Form prefill from Stripe | Email, name, phone, billing address pre-populated from `customer_details` |
| Shipping address capture | Collected by Stripe at checkout, written to `Job.shipping_address` group |
| Job type auto-fill | `session.metadata.job_type` → `job.job_type` (street/studio) |
| Delivery method auto-fill | `shipping_rate.display_name` or `session.metadata.delivery_method` → `job.delivery_method` (pickup/delivery) |
| Payment auto-recorded | `payment_methods[]` entry with method=website, amount, date created automatically |
| Discount tracking | Coupon codes, discount amount, tax amount all pulled from session |
| Stripe IDs on job | `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_payment_link_id`, `stripe_customer_id` — all populated at creation |
| Defense in depth | `/api/intake` re-verifies the session server-side; a form POST with a forged `stripe_checkout_session_id` is rejected |
| Payment-failed blocking | If Stripe reports `payment_status !== 'paid'`, the form is completely hidden (hard block) |

### What we lose by putting intake before payment

1. **Payment verification gate** — the form is now open to anyone, paid or not.
   This is likely intentional (you want to capture leads), but you lose the
   automatic "only paying customers use this form" filter.

2. **Stripe prefill** — no email/name/phone/address to pre-populate. Users type
   everything from scratch. Higher friction, more typos, no address capture.

3. **Shipping address from Stripe** — gone. You'd need to add shipping address
   fields to the intake form if you still want them.

4. **Job type / delivery method auto-fill** — Payment Link metadata
   (`job_type`, `delivery_method`) arrives at payment time, not form time. You
   can either (a) move these fields to the intake form as explicit questions, or
   (b) back-fill them later via webhook when payment completes.

5. **Payment auto-record** — no payment at intake time means no
   `payment_methods[]` entry. This must happen later when payment completes.

6. **Stripe IDs** — none at intake time. Must be populated retroactively.

7. **Defense in depth** — no server-side re-verification needed, since there's
   no Stripe session to verify.

---

## 2. Two architectural approaches

### Approach A: Intake → Payment Link (with webhook backfill)

The simplest change to the user-facing flow. Keep your existing Stripe
Payment Links as-is. After intake form submission, redirect the client to the
Payment Link URL. A new webhook handler hears `checkout.session.completed` and
updates the job with payment data.

```
WP Checkout → /intake → Job stub created (status: awaiting_payment)
                              ↓
                       Redirect to Stripe Payment Link
                       (buy.stripe.com/xxx?client_reference_id=JOB_ID)
                              ↓
                       Stripe checkout → payment completes
                              ↓
                       Webhook: checkout.session.completed
                       → find Job by client_reference_id
                       → update with all Stripe fields
                       → change status to intake_received
```

**Changes required:**

| # | Area | What changes | Complexity |
| --- | --- | --- | --- |
| 1 | `page.tsx` | Remove `searchParams.session`, `getSessionPrefill` call, `isPaymentFailed`/`isUnexpected` blocks. Form always renders. Remove `prefill` and `stripeSessionId` props. | Low |
| 2 | `IntakeForm.tsx` | Remove `prefill`/`stripeSessionId` props. After successful submit, redirect user to Payment Link URL. Need to store the URL (env var or hardcoded). Remove hidden `stripe_checkout_session_id` input. | Low |
| 3 | `/api/intake` POST | Remove all Stripe session verification. Remove all Stripe field population. Job created with `status: 'awaiting_payment'` (new status). Return `{ success: true, jobId, checkoutUrl }` so the client can redirect. No `payment_methods[]` entry. No shipping address. | Medium |
| 4 | **NEW: Stripe webhook** | `src/app/api/stripe/webhook/route.ts` — handles `checkout.session.completed`. Verifies signature with `STRIPE_WEBHOOK_SECRET`. Finds job by `client_reference_id` (set via Payment Link URL param). Updates job with all `stripe_*` fields, shipping address, payment_methods entry, changes status to `intake_received`. Must handle idempotency (Stripe may deliver more than once). | High |
| 5 | Jobs collection | Add `awaiting_payment` to status options. Optionally add `client_reference_id` field (or reuse existing `stripe_checkout_session_id` — populated by webhook). | Low |
| 6 | Stripe dashboard | Configure webhook endpoint (`https://portal.petportraits.ink/api/stripe/webhook`), subscribe to `checkout.session.completed`. Ensure Payment Link URLs accept `?client_reference_id=...` (supported by Stripe). | Low |
| 7 | Jobs dashboard | No changes needed. `awaiting_payment` jobs will show in kanban automatically. | None |
| 8 | Env vars | Add `STRIPE_WEBHOOK_SECRET` (separate from existing `STRIPE_POS_WEBHOOK_SECRET`, or reuse if same signing secret). | Low |

**Total estimated effort**: ~4–6 hours of coding + tests + Stripe dashboard setup.

**Pros:**

- Keeps existing Payment Links (no Stripe product/price changes)
- Payment Link metadata (`job_type`, `delivery_method`) back-filled by webhook
- Client doesn't wait for Stripe API calls during form submission
- Webhook is the canonical Stripe pattern for async payment confirmation
- Fail-open: if webhook is delayed, job still exists as `awaiting_payment`

**Cons:**

- No prefill — users type everything from scratch
- No shipping address from Stripe (unless you add address fields to the form, or the webhook back-fills it — but the address is already collected by Stripe at checkout, so the webhook can back-fill `Job.shipping_address` from the session. That works as long as you don't need the address BEFORE payment.)
- Webhook is new infrastructure (another thing that can break silently — needs monitoring)
- `client_reference_id` via Payment Link URL param must be tested — Stripe docs say it works, but the UX of passing it as a query param on a `buy.stripe.com` link needs verification
- If the user abandons at the Payment Link, you have a job stub with no payment — this might be desirable (lead capture) or noise, depending on volume

---

### Approach B: Intake → Checkout Session (API-driven)

Replace Payment Links entirely. After intake form submission, `/api/intake`
creates a Stripe Checkout Session server-side (with dynamic product selection,
`client_reference_id=job.id`, metadata) and returns the checkout URL.

```
WP Checkout → /intake → Job stub created
                         Stripe Checkout Session created (API call)
                         Return { checkoutUrl: session.url }
                              ↓
                       Redirect to Stripe-hosted checkout
                              ↓
                       Payment completes
                              ↓
                       Webhook: checkout.session.completed
                       → update Job (same as Approach A)
```

**Additional changes vs Approach A:**

| # | Area | Change | Complexity |
| --- | --- | --- | --- |
| B1 | `/api/intake` | After job creation, call `stripe.checkout.sessions.create()` with dynamic product/price, quantity, metadata, `client_reference_id`. Requires product selection logic — the form needs a way to specify which product/price the user wants. Could be: (a) a hidden field from WP, (b) a product picker on the intake form, or (c) a single hardcoded price. | High |
| B2 | Intake form | Needs to communicate product selection to the API. If WP passes product info via query params, that works. If not, the form needs a product picker. | Medium |
| B3 | Stripe dashboard | Remove Payment Links (or deprecate). Checkout Sessions are created via API, not dashboard. | Low |
| B4 | Stripe webhook | Same as Approach A. | High |

**Pros:**

- Full control over the checkout session (dynamic pricing, product selection, metadata)
- No pre-configured Payment Links to maintain
- `client_reference_id` is set explicitly in the API call (no URL param hack)
- Can customize the checkout experience per-order (e.g., different line items per job type)

**Cons:**

- More complex than Payment Links
- Product/price selection must be handled in the intake flow (moves complexity from Stripe dashboard to code)
- Payment Links provide a nice Stripe-hosted product page — Checkout Sessions jump straight to the checkout form
- Requires maintaining Stripe product/price IDs in code or config

---

## 3. What stays unchanged regardless of approach

| Component | Status |
| --- | --- |
| Photo upload flow (`/api/intake/upload-urls`, S3 presigned URLs) | **Unchanged** — no Stripe dependency |
| Telemetry events (`/api/intake/events`, `IntakeEvents` collection) | **Unchanged** — no Stripe dependency |
| Draft persistence (`localStorage`) | **Unchanged** |
| Partial submit (`?partial=1`) | **Unchanged** |
| Email notifications (`sendIntakeNotification`) | **Minor change**: subject/body should indicate payment is pending |
| Client matching (`findOrCreateClient`) | **Unchanged** — still works by email |
| Jobs dashboard kanban | **Unchanged** (new `awaiting_payment` status appears automatically) |
| POS webhook (`/api/stripe/pos`) | **Unchanged** — separate flow, separate endpoint |
| Dashboard quick actions | **Unchanged** |

---

## 4. Risks and open questions

### Risks

1. **Webhook reliability** — Stripe webhooks are generally reliable but not
   guaranteed real-time. A delay of 30–60 seconds between payment and job
   update is normal. If the webhook fails (network error, 5xx from our
   endpoint), Stripe retries with exponential backoff for up to 3 days. The
   job stays in `awaiting_payment` until the webhook succeeds. You'd want to
   monitor for jobs stuck in this status.

2. **Idempotency** — Stripe may deliver the same event more than once. The
   webhook handler must be idempotent. Check if the job already has
   `stripe_checkout_session_id` populated before updating (the session ID is
   unique per checkout).

3. **Race conditions** — The user could theoretically submit the form, get
   redirected to Stripe, close the tab, and never complete payment. The job
   stub exists but is incomplete. This is fine (lead capture) but you may want
   a cleanup policy for `awaiting_payment` jobs older than N days with no
   payment.

4. **Payment Link → Webhook execution order** — If you use Approach A with
   `client_reference_id` in the Payment Link URL, verify that Stripe actually
   passes it to the Checkout Session and that it appears in the
   `checkout.session.completed` webhook payload. Stripe docs confirm this, but
   test it.

5. **No prefill = more friction** — The current prefill is genuinely helpful.
   Without it, users retype email/name/phone. If they make a typo in the
   email, the Stripe checkout email may not match the intake form email (and
   `findOrCreateClient` uses the intake email, not the Stripe email). The
   webhook updates the Job, not the Client. This could create disjoint client
   records if the emails differ. Mitigation: the webhook could also update the
   client record with the Stripe-verified email, or the Job's client
   relationship could be switched.

### Open questions for Alvar

1. **Why reorder?** — Understanding the motivation helps choose the right
   approach. Is it:
   - To capture leads who abandon at payment? (→ Approach A is fine)
   - To reduce friction at payment time? (→ Approach B may be better)
   - To collect pet info before asking for money? (→ Either works)
   - Something else?

2. **WP Checkout's role** — Currently WP is the first step. If intake comes
   before payment, does WP still come first? Or does WP go away entirely? The
   intake form could subsume WP's product selection if you want.

3. **Product selection** — With the current Payment Links, the user already
   chose their product on WP and the link corresponds to a specific SKU. If
   intake comes before payment, how does the intake form know which
   product/price to use? Options:
   - WP passes product info via query param to `/intake`
   - The intake form includes a product picker
   - There's only one product/price (simplest)

4. **Payment Link acceptance of `client_reference_id`** — Needs testing.
   According to Stripe docs, Payment Link URLs accept `?prefilled_email=...`
   and `?client_reference_id=...`. But this should be verified in test mode
   before committing to Approach A.

5. **Address collection** — Do you still want shipping address? Currently
   Stripe collects it. Without pre-payment Stripe, you'd need to either (a)
   add address fields to the intake form, (b) let Stripe collect it at
   checkout and back-fill via webhook (the address would arrive after the form
   is submitted, so you wouldn't have it until payment is complete), or (c)
   drop address collection.

6. **Pre-fill from WP** — If WP has the customer's name and email, WP could
   pass them to `/intake?first_name=...&email=...` as query params, restoring
   some of the prefill benefit. This is independent of the Stripe reorder but
   worth considering.

---

## 5. Recommendation

**Start with Approach A (Intake → Payment Link + webhook)** for these reasons:

1. It's the smallest change. Payment Links stay as-is.
2. You can test the webhook in parallel with the current flow before
   switching.
3. If `client_reference_id` via Payment Link URL doesn't work as expected,
   you can fall back to a confirmation page approach (the Payment Link success
   URL redirects to `/intake/confirm?job=ID&session=cs_...`, and that page
   updates the job — no webhook needed, but it relies on the user not closing
   the tab).
4. It preserves the option to switch to Approach B later.

**If the motivation is purely lead capture** (you want the intake data even
if they never pay), you could also consider keeping the current flow AND
adding a "no payment yet" intake path. Two entry points:

- `/intake` — current path, requires payment (WP → Stripe → intake)
- `/intake/free` — new path, no payment required, creates `awaiting_payment` job

This is the least disruptive: you don't break the working paid-user flow,
and you get lead capture from a separate entry point. The WP checkout could
link to either path depending on whether the user has paid.

---

## A. Appendix: Files affected by each approach

### Files removed or heavily modified (Approach A)

| File | Change |
| --- | --- |
| `src/app/(frontend)/intake/page.tsx` | Remove Stripe session fetch, prefill props, payment-failed blocking |
| `src/app/(frontend)/intake/IntakeForm.tsx` | Remove `prefill`/`stripeSessionId` props; add post-submit redirect to Payment Link URL |
| `src/app/(frontend)/intake/StripeError.tsx` | **Delete** — no longer needed (no payment-failed blocking) |
| `src/app/api/intake/route.ts` | Remove Stripe session re-verification; remove `stripe_*` field population; Job created as stub `awaiting_payment`; return `checkoutUrl` |
| `src/app/api/intake/upload-urls/route.ts` | **Unchanged** |
| `src/app/api/intake/events/route.ts` | **Unchanged** |
| `src/lib/stripe.ts` | `getSessionPrefill()` may be partially repurposed for the webhook, or kept for reference. `getStripeClient()` stays. |
| `src/collections/Jobs.ts` | Add `awaiting_payment` to status options |
| `src/lib/findOrCreateClient.ts` | **Unchanged** |

### New files (Approach A)

| File | Purpose |
| --- | --- |
| `src/app/api/stripe/webhook/route.ts` | Webhook handler for `checkout.session.completed` |
| `tests/int/stripe-webhook.int.spec.ts` | Integration tests for webhook handler |

### Stripe dashboard changes (Approach A)

| Change | Detail |
| --- | --- |
| New webhook endpoint | `https://portal.petportraits.ink/api/stripe/webhook` |
| Subscribe event | `checkout.session.completed` |
| Payment Link URLs | Add `?client_reference_id={JOB_ID}` dynamically (needs JS redirect on the client side) |
