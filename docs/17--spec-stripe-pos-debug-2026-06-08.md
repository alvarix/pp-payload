# Stripe POS Webhook Debug — 2026-06-08

## Symptom

42 total webhook deliveries, 42 failed (400) in Stripe dashboard.
7 POS charges processed on 6/6 via live Terminal tap.
Dozens of 400 errors on 6/6, then 6-7 per day on subsequent days with no new sales.
No Client or Job records were created in the CRM.

---

## Diagnosis

### Root cause: wrong signing secret in Vercel

`400 = Invalid signature` is the only code path that returns a 400 in `route.ts`:

```ts
} catch (err) {
  console.warn("[stripe-pos] Signature verification failed:", err);
  return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
}
```

The URL was reachable (a connection error would not produce a 400).
`STRIPE_POS_WEBHOOK_SECRET` was present in Vercel (added ~6/3) but contained
the wrong value — likely copied from test mode or a different webhook endpoint.

### Why the daily retries with no new sales

Stripe retries failed webhook deliveries on an exponential backoff schedule for
up to 72 hours:

```
5m → 30m → 2h → 5h → 10h → 1 day → 2 days → 3 days
```

The 6-7 events per day after 6/6 were Stripe retrying the original 7 failed
events — one retry per event per day. Not new sales. Retries stop automatically
~72h after the original failure (6/6 → 6/9).

---

## Fix Applied

1. Retrieved the correct `whsec_...` signing secret from Stripe Dashboard →
   **Live mode** → Developers → Webhooks → `/api/stripe/pos` endpoint →
   Signing secret → Reveal.
2. Updated `STRIPE_POS_WEBHOOK_SECRET` in Vercel dashboard → Settings →
   Environment Variables (edit in place, Production + Preview checked).
3. Redeployed.

### Verified with Stripe CLI

```bash
stripe trigger payment_intent.succeeded
```

Returns 200 (signature verified). Event is a non-card_present type so no record
is created — that is expected behavior. Confirms the secret mismatch is resolved.

---

## Recovery — the 7 missed charges

Stripe retries end ~6/9. If any retries succeed automatically after the fix,
Job records will be created. For any that do not:

- Stripe Dashboard → Webhooks → endpoint → Event deliveries
- Filter to failed events from 6/6
- **Resend** each of the 7 `payment_intent.succeeded` events manually

Each resend will create a Client (find or create by email) and a Job stub with
`source: pos`, `status: intake_received`, and `payment_methods: [{ method: 'pos' }]`.

---

## Files Involved

| File | Role |
|---|---|
| `src/app/api/stripe/pos/route.ts` | Webhook handler — signature verification + job creation |
| `src/lib/stripe-pos.ts` | `extractPosPayment()` — filters to card_present only |
| `src/lib/findOrCreateClient.ts` | Client find-or-create shared helper |

No code changes were required. Issue was purely a misconfigured environment variable.

---

## Status

- [x] Root cause identified
- [x] Signing secret corrected in Vercel
- [x] Redeployed
- [x] Signature verification confirmed with `stripe trigger`
- [ ] 7 missed charges recovered via manual resend (pending — retry window may still be open)
