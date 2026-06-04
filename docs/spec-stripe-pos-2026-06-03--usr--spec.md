# Stripe POS Auto-Record — User Spec & Task Checklist
**Date:** 2026-06-03

---

## Goal

When a Stripe Terminal (POS) sale completes, automatically create a Client + Job stub
in the CRM so revenue is tracked without manual data entry.

---

## Tasks

### Prep (you)
- [ ] Create webhook endpoint in Stripe dashboard → `https://<domain>/api/stripe/pos`
- [ ] Copy signing secret to `STRIPE_POS_WEBHOOK_SECRET` in Vercel + local `.env`
- [ ] (Optional) Add `metadata: { job_type: 'street' }` to terminal charges

### Step 1 — Webhook endpoint
- [x] `src/app/api/stripe/pos/route.ts` created
- [x] Signature verification working (400 on bad sig)
- [x] Only acts on `payment_intent.succeeded`

### Step 2 — POS filter + extract
- [x] `src/lib/stripe-pos.ts` with `extractPosPayment()`
- [x] Correctly filters to `card_present` only

### Step 3 — Client find/create
- [x] `src/lib/findOrCreateClient.ts` shared helper
- [x] Handles missing email — skip + log warning

### Step 4 — Job creation
- [x] Job stub created with `pos` payment method entry
- [x] All Stripe fields populated
- [x] `minRows` relaxed to 0 — pets array empty on POS stubs

### Step 5 — Email notification
- [x] Notification sent on POS job creation

### Step 6 — Tests
- [x] Unit tests for `extractPosPayment` (6 passing)
- [ ] Integration tests for webhook endpoint

### Step 7 — Deploy + manual test
- [x] Stripe CLI replay test — Client + Job created in admin
- [ ] Live terminal tap (card_present) — pending real hardware test
- [ ] Notification email received on live tap

---

## Open Questions (answer before execution)

1. **No-email POS sales:** skip record, log warning only.
   - [x] Option B — skip, log warning

2. **Job `source` field:** add `source` select (`website` / `pos` / `manual`) to Jobs.
   - [x] Yes

3. **Webhook secret:** share existing `STRIPE_WEBHOOK_SECRET`.
   - [x] Share existing `STRIPE_WEBHOOK_SECRET`

4. **Pets:** relax `minRows` to 0 on Jobs so POS stubs have no pet rows.
   - [x] Relax `minRows` to 0

5. **Follow-up intake link:** not needed.
   - [x] No

---

## Feedback / Iteration Notes

_(Add notes here as we go)_
