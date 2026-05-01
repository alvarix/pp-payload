# Spec: email subscribe form → Clients

A public form anyone can use to subscribe to marketing emails. Captures into the existing `Clients` collection so subscribers and customers share one source of truth.

## Recommendation

Reuse the `Clients` collection rather than a separate `Subscribers` collection. A subscriber today is a customer tomorrow — sharing the table avoids dedup work later. Mark origin with a boolean so we can distinguish "purchased then opted in" vs "subscribed cold".

## Schema change

`src/collections/Clients.ts` — add one field:

```ts
{
  name: "subscribed_from_form",
  type: "checkbox",
  label: "Subscribed via Form",
  defaultValue: false,
  index: true,
  admin: {
    description: "True if the client originated from the public subscribe form (vs. intake or import).",
  },
}
```

`marketing_consent` already exists on Clients — set to `true` on subscribe (explicit opt-in via the form is consent).

## Migration

`src/migrations/20260428_150000_add_client_subscribed_from_form.ts`:

```sql
ALTER TABLE "clients" ADD COLUMN "subscribed_from_form" boolean DEFAULT false;
CREATE INDEX "clients_subscribed_from_form_idx" ON "clients" USING btree ("subscribed_from_form");
```

## API route

`src/app/api/subscribe/route.ts` — public, unauthenticated POST:

```
POST /api/subscribe
Body: { email: string, first_name?: string, last_name?: string, hp?: string }
```

Behavior:
1. Validate `email` shape (use `zod` or a simple regex).
2. **Honeypot**: if `hp` is non-empty, return `200 { ok: true }` (silently drop spam).
3. Lookup `Clients` by email. If found → `update` setting `marketing_consent=true`, `subscribed_from_form=true` (only if not already set, so we don't clobber an existing customer's `subscribed_from_form=false` status — actually do clobber it; the user re-affirmed). Backfill `first_name`/`last_name` only if currently empty.
4. If not found → `create` with `email`, `first_name`, `last_name`, `marketing_consent=true`, `subscribed_from_form=true`.
5. Return `{ ok: true }` regardless of new vs existing (don't leak whether an email is in the system).
6. **Rate limit**: same risk as `/api/intake` (launch checklist #6). Defer to that fix; document the risk in the route.

Response codes:
- `200 { ok: true }` — success or silent honeypot drop.
- `400 { error: "Invalid email" }` — malformed email.
- `500 { error: "Internal error" }` — DB failure (don't leak `e.message`).

## Page

`src/app/(frontend)/subscribe/page.tsx` — minimal HTML form:

```
[ first name (optional) ]
[ last name  (optional) ]
[ email *               ]
[ honeypot (hidden)     ]
[ Subscribe ]
```

Submit → `fetch('/api/subscribe', { method: 'POST', body: JSON.stringify(...) })` → swap form for a thank-you message on success.

Style consistent with `/intake` form (Tailwind, single column, mobile-friendly).

## Embedding elsewhere

If the WordPress public site wants the same form, it can `POST` directly to `https://portal.petportraits.ink/api/subscribe` from any HTML form. CORS: keep the route same-origin only for now; open up only if WordPress needs it (then restrict `Access-Control-Allow-Origin` to the WP domain).

## Acceptance criteria

- Visiting `/subscribe` shows a form with email + optional name fields.
- Submitting a new email creates a Client row with `marketing_consent=true`, `subscribed_from_form=true`.
- Submitting a known customer's email updates that Client to `marketing_consent=true`, `subscribed_from_form=true` without overwriting their `first_name`, `last_name`, `phone`, or `address`.
- The Clients admin list view can be filtered by `subscribed_from_form=true` to see all marketing-only signups.
- The form silently drops bots that fill the honeypot field.
- The API doesn't reveal whether a given email is already in the database.

## Out of scope

- Double opt-in (confirmation email). Worth doing eventually — currently anyone can sign anyone else up. Defer until you have a transactional email provider wired in.
- Unsubscribe flow. Required for legal compliance once you actually send marketing emails — design alongside the email-sending pipeline.
- Rate limiting. Inherits the same gap as `/api/intake`; fix both at once with the launch-checklist #6 work.
- Captcha. Honeypot is enough until you see real bot traffic.
- Welcome email. No email provider wired yet.

## Effort

~1 hr: schema + migration (10), API route (20), form page (20), thank-you state + basic styling (10).
