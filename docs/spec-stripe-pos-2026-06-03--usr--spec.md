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
- [ ] `src/app/api/stripe/pos/route.ts` created
- [ ] Signature verification working (400 on bad sig)
- [ ] Only acts on `payment_intent.succeeded`

### Step 2 — POS filter + extract
- [ ] `src/lib/stripe-pos.ts` with `extractPosPayment()`
- [ ] Correctly filters to `card_present` only

### Step 3 — Client find/create
- [ ] `src/lib/findOrCreateClient.ts` shared helper
- [ ] Handles missing email (placeholder or skip — confirm in open questions)

### Step 4 — Job creation
- [ ] Job stub created with `pos` payment method entry
- [ ] All Stripe fields populated
- [ ] Pets placeholder handles `minRows: 1` constraint

### Step 5 — Email notification
- [ ] Notification sent on POS job creation

### Step 6 — Tests
- [ ] Unit tests for `extractPosPayment`
- [ ] Integration tests for webhook endpoint

### Step 7 — Deploy + manual test
- [ ] Stripe CLI replay test against Vercel preview
- [ ] Client + Job appear correctly in admin
- [ ] Notification email received

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
