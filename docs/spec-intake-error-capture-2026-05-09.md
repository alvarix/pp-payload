# Spec: intake form — error capture, draft persistence, partial submit

Clients keep reporting failures with `/intake` that Alvar never sees: a validation error blocks the submit button and the user gives up, or a network failure surfaces only as a generic "try again" and the data is lost on refresh. Today the only signal a problem occurred is the client telling us. This spec adds three coordinated pieces so we hear about the trouble and keep the data:

1. **Telemetry beacon** — front-end posts errors and abandonment to a new endpoint; server emails Alvar.
2. **Draft persistence** — text fields (not photos) auto-save so a refresh, network blip, or "I'll come back later" doesn't lose work.
3. **Partial submit path** — a secondary CTA that creates a job with whatever data we have, even if photos are over the limit or missing.

The Alph-Planner postmortem (`apps/Alph-Planner/docs/postmortem-grid-version.md`) describes the same shape of failure: silent drift between what the system thinks happened and what actually happened, made invisible because nothing reports it. This spec's goal is to make intake failures *loud*.

## Current state (file pointers)

- Form: `src/app/(frontend)/intake/IntakeForm.tsx` — single-page React form, `handleSubmit` at line 53.
- Endpoint: `src/app/api/intake/route.ts` — single POST, no draft path.
- Validation: lines 14–35 (10 photos / 10MB each / 70MB total). When `hasPhotoError`, submit is `disabled` (line 355) — user has no escape.
- Errors surfaced: `submitStatus === "error"` only on POST failure (lines 343–351). Validation errors are inline only — never reach the server, never reach Alvar.
- Email: `src/lib/email.ts` `sendIntakeNotification()` already wired to Brevo.
- Persistence: none. State lives in React only; refresh wipes everything.

## What "front-end error" means here

We care about three event types, in roughly increasing severity:

| Event | When | Email Alvar? |
|---|---|---|
| `validation_blocked` | User has a state that disables submit (oversized files, too many, total too large) for ≥30s | Yes, once per session |
| `submit_failed` | POST `/api/intake` returns non-2xx or throws | Yes, immediately |
| `abandoned` | User has filled ≥1 field and leaves the tab/closes the page without success | Yes, once, on `pagehide` |

Plus one informational event (no email, just stored): `field_progress` — debounced snapshot of the form so the abandonment email has content.

Console JS errors are out of scope for v1. If we want them later, wrap in a `window.onerror` handler that posts to the same endpoint.

## Architecture

```
IntakeForm
  ├─ on field change (debounced 1.5s) ─► POST /api/intake/events  { type: "field_progress", sessionId, formSnapshot }
  ├─ on validation error (after 30s)  ─► POST /api/intake/events  { type: "validation_blocked", sessionId, errors, formSnapshot }
  ├─ on submit failure                 ─► POST /api/intake/events  { type: "submit_failed", sessionId, error, formSnapshot }
  └─ on pagehide (if dirty)            ─► navigator.sendBeacon /api/intake/events  { type: "abandoned", sessionId, formSnapshot }

  ├─ on field change ─► localStorage.setItem("intake_draft", snapshot)   // local restore
  └─ on mount        ─► restore from localStorage if present

/api/intake/events
  ├─ upsert into intake_events table by sessionId
  └─ for { submit_failed, validation_blocked, abandoned }: send email (deduped per sessionId+type)
```

`sessionId` is a random UUID generated once on form mount and stored in `sessionStorage`. It groups all events from one user's attempt — so the email Alvar receives can summarize "user X had 3 validation errors then abandoned" instead of one email per event.

## Data model — new Payload collection `intake-events`

Single collection, one row per *event* (not per session). Easier to query, no upsert logic needed.

```ts
// src/collections/IntakeEvents.ts
{
  slug: "intake-events",
  admin: { useAsTitle: "session_id" },
  access: { read: ({ req }) => Boolean(req.user) },  // admin-only read
  fields: [
    { name: "session_id", type: "text", required: true, index: true },
    { name: "event_type", type: "select", required: true, options: [
      "field_progress", "validation_blocked", "submit_failed", "abandoned",
    ]},
    { name: "form_snapshot", type: "json" },     // text fields only, never files
    { name: "error_details", type: "json" },     // { errors: [...], userAgent, url }
    { name: "stripe_session_id", type: "text" }, // if present in form
    { name: "user_agent", type: "text" },
    { name: "created_at", type: "date", admin: { readOnly: true }, defaultValue: () => new Date() },
  ],
}
```

Migration approach: per `feedback_migrations.md` guidance, write a single hand-crafted migration that creates the table and one index on `session_id`. Don't auto-generate.

**Note on PII:** form snapshots contain email and phone. The collection is admin-read-only. Don't expose it via any public endpoint. Add a retention sweep (cron) that deletes rows >90 days old — out of scope for v1, but file as a follow-up.

## Endpoint — `src/app/api/intake/events/route.ts`

```ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, sessionId, snapshot, error } = body;

    if (!sessionId || !type) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const payload = await getPayload({ config: configPromise });

    // Sanitize snapshot — drop any unexpected keys, cap string length
    const safeSnapshot = sanitizeSnapshot(snapshot);

    await payload.create({
      collection: "intake-events",
      data: {
        session_id: sessionId,
        event_type: type,
        form_snapshot: safeSnapshot,
        error_details: error ?? null,
        user_agent: request.headers.get("user-agent") ?? "",
        stripe_session_id: safeSnapshot?.stripe_checkout_session_id,
      },
    });

    // Email triggers — dedupe by checking if same (sessionId, type) already emailed.
    // Cheapest dedupe: check if a prior row of same (sessionId, type) exists; skip email if so.
    if (type === "submit_failed" || type === "validation_blocked" || type === "abandoned") {
      const prior = await payload.find({
        collection: "intake-events",
        where: {
          and: [
            { session_id: { equals: sessionId } },
            { event_type: { equals: type } },
          ],
        },
        limit: 2,
      });
      // The row we just created counts as 1; >1 means we've already emailed.
      if (prior.docs.length <= 1) {
        await sendIntakeErrorAlert({ type, sessionId, snapshot: safeSnapshot, error });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("intake events endpoint failed:", err);
    // Never block the user — telemetry failure must not surface to the form.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
```

Rate-limiting: not in v1. The endpoint is unauthenticated and could be abused. Mitigations to consider once it's in production: a small Redis-less in-memory rate limit per IP (10 events/minute), or move dedupe to a 60-second `submitted` cookie. Document as a follow-up.

## New email — `sendIntakeErrorAlert`

Add to `src/lib/email.ts` alongside `sendIntakeNotification`. Same Brevo plumbing.

```
Subject: [intake] {type}: {firstName || email || "anonymous"}

Type:    {type}
Session: {sessionId}
Time:    {iso}

Form so far:
  Name:  {firstName} {lastName}
  Email: {email}
  Phone: {phone}
  Pet:   {petName} ({petBreed})

Error details:
  {errorDetails JSON, pretty-printed}

Stripe session: {stripeSessionId or "none"}

Admin link (filter events by session):
https://portal.petportraits.ink/admin/collections/intake-events?where[session_id][equals]={sessionId}
```

Plain text. No HTML.

## Front-end changes — `IntakeForm.tsx`

### 1. Session ID + dirty tracking
```ts
const sessionIdRef = useRef<string>();
useEffect(() => {
  let id = sessionStorage.getItem("intake_session_id");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("intake_session_id", id); }
  sessionIdRef.current = id;
}, []);
```

### 2. Draft persistence (localStorage, text fields only)
- On every input `onChange`, debounced 500ms, write `JSON.stringify(snapshot)` to `localStorage["intake_draft"]`.
- On mount, if a draft exists, populate `defaultValue` from it (preferring Stripe prefill if both present? — flag as open question, see below).
- On successful submit, `localStorage.removeItem("intake_draft")`.

Photos are *not* drafted. They remain in-memory only. A small note next to the photo input: "Photos will need to be re-selected if you refresh."

### 3. Telemetry beacon

Helper:
```ts
function postEvent(type: string, extra: object = {}) {
  const body = JSON.stringify({
    type,
    sessionId: sessionIdRef.current,
    snapshot: getCurrentSnapshot(),  // reads form fields by name
    ...extra,
  });
  // sendBeacon for pagehide; fetch otherwise.
  if (type === "abandoned" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/intake/events", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/intake/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .catch(() => {});
  }
}
```

Wire-up:
- `field_progress`: debounced 1500ms after any input change.
- `validation_blocked`: when `hasPhotoError` first becomes true, start a 30s timer; if still true at expiry, post once (track via ref).
- `submit_failed`: in the existing `catch` block at line 73.
- `abandoned`: `useEffect` adds a `pagehide` listener; fires only if `dirty && !submittedSuccessfully`.

Dirty = any required text field has been modified.

### 4. Partial submit CTA

When `hasPhotoError` is true, in addition to the disabled main submit button, show:

```
[Submit without photos]

Please DM photos on Instagram to @alvar.nyc or email alvar@petportraits.ink
```

The button label is concise; the helper line below it tells the client exactly how to deliver photos out-of-band. Render `@alvar.nyc` as a link to `https://instagram.com/alvar.nyc` and the email as a `mailto:` link with subject prefilled to "Photos for {petName}" (fall back to "Photos for intake" if pet name not yet entered).

This calls a new endpoint `POST /api/intake/partial` (or a `?partial=1` query on the existing endpoint) that:
- skips photo validation
- still creates a `jobs` record with status `intake_received`
- sets `notes` to include "[partial submit: photos pending — client to send via IG/email]" prefix
- triggers `sendIntakeNotification` with a subject prefix `[partial]`

Server change is small — extract photo validation in `route.ts` into a function and skip when `partial` flag is set. The existing 413 path remains for the regular submit.

Alvar then knows to expect photos via DM or email from this client.

## Acceptance criteria

- Triggering oversized-photo error and waiting 30s emails Alvar exactly once.
- Closing the tab after filling name/email but before submit emails Alvar within ~5s (sendBeacon).
- Refreshing the page mid-form restores text fields (not photos) from localStorage.
- Successful submit clears the localStorage draft.
- Clicking "Submit without photos" creates a job and emails Alvar with `[partial]` subject prefix.
- The same browser session firing 5 validation errors emails Alvar **once**, not 5 times.
- Telemetry endpoint failure does not surface any error to the form (never breaks the user's flow).
- The new `intake-events` collection is admin-only readable.

## Test plan

Per the user's preference for explicit tests:

1. **Playwright e2e** (`tests/intake-error-capture.spec.ts`):
   - Fill name/email, attach an oversized photo, wait 30s, assert one row in `intake-events` with `event_type=validation_blocked`.
   - Fill form, submit, intercept `/api/intake` to return 500, assert one row with `submit_failed`.
   - Fill name only, navigate away, assert one row with `abandoned`.
   - Fill form, refresh, assert text fields restored from localStorage.
   - Trigger 5 validation errors in same session, assert only one email send (mock Brevo and count calls).

2. **Vitest unit** (`src/lib/__tests__/sanitizeSnapshot.test.ts`):
   - Drops unknown keys, caps string length, never includes file objects.

3. **Manual smoke**: submit a partial form via the new CTA on staging, confirm `[partial]` email arrives and `jobs` record exists.

## Effort

- Collection + migration + types regen: 30 min
- `/api/intake/events` endpoint + `sendIntakeErrorAlert`: 45 min
- Front-end (sessionId, draft, beacon, partial CTA): 90 min
- Partial endpoint (or flag on existing): 30 min
- Tests: 60 min
- DNS / Brevo verification (already done for `sendIntakeNotification`): 0

Total: ~4 hours including tests.

## Open questions

- **Draft vs Stripe prefill precedence.** If a user came from Stripe (prefill present) AND has a localStorage draft, which wins? Recommendation: draft wins for fields the user has touched, prefill fills the rest. Alternatively, simpler: draft wins entirely if newer than 24 hours, else prefill. Need to confirm with Alvar.
- **PII retention.** 30-day TTL on `intake-events`? 90? Indefinite? Default to 90 with a follow-up cron.
- **Should `field_progress` events truly be stored every 1.5s?** This will produce a lot of rows. Alternative: only store the latest per `session_id` (upsert). Simpler-but-stores-more wins for v1; revisit if volume is a problem.
- **Rate-limit strategy** — see endpoint section. Track as a follow-up.

## Out of scope

- Email digest/batching (current design dedupes per type per session, which is sufficient).
- Window error / unhandled rejection capture.
- Sentry / external observability — overkill for an intake form.
- Photo drafts — too large; not worth the complexity. The "partial submit" CTA is the escape hatch instead.
