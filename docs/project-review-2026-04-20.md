# Project Review — 2026-04-20

Living analysis doc. Captures findings from a one-pass audit of `pp-v2` and organizes them around near-term priorities. Sections marked "Open question" are unresolved and block action below them.

## Near-term trajectory (context for every decision below)

1. **Replace the WordPress intake form** — point WP at `/api/intake` instead of its current form handler. This app becomes the primary capture path for new clients/jobs.
2. **Hook up Stripe** — auto-populate payment fields on Jobs from Stripe charge / refund events.
3. **Dashboard UX rework** — column reorder, hide columns, move tasks between columns, richer job cards.
4. **Events collection** is parked for now. No changes to Events in this pass.

Every recommendation below is ordered so WP (1) unblocks first, Stripe (2) is not regressed by the work, and the dashboard rework (3) lands on a data model that won't need thrashing afterwards.

## Audit corrections

The initial audit flagged credentials and SSH keys as leaked in git history. **Verified not leaked.** `.env`, `pp-wp`, `pp-wp.pub` are gitignored and absent from git history. `test.env` is tracked but contains only a harmless `NODE_OPTIONS` flag. No credential rotation needed.

Status: no action required.

---

## Findings grouped by priority

### A — WP intake replacement prerequisites (blocks your next act)

Once the WordPress site POSTs to `/api/intake` in production, the endpoint is on the open internet. Three problems need solving before that cutover:

#### A1. `/api/intake` is unauthenticated and unvalidated
File: `src/app/api/intake/route.ts`

- No rate limit. No CAPTCHA. No shared-secret header. No origin check.
- No file MIME / size validation at lines 44–67. `file.type` is user-supplied and trivially spoofed.
- All form values cast with `as string` — no schema validation. Malformed payloads silently create bad records.

**Proposed defense in depth:**
1. Shared-secret header: require `x-intake-key` matching `process.env.INTAKE_KEY`. WP plugin sends it. Cheapest first line.
2. Zod schema for the form body (dep: `zod`).
3. File constraints: max 10 MB per file, max 6 files per submission, allowlist `image/jpeg | image/png | image/webp | image/heic`. Read actual byte length, don't trust `file.size`.
4. Rate limit: in-memory LRU by IP (≤10 req/minute). Process-lifetime scope is fine — this is a solo-traffic site, not a SaaS.

**Tests to write alongside:**
- Missing `x-intake-key` → 401
- Malformed email → 400
- 20 MB file → 413
- 11th request from same IP in 60s → 429

#### A2. CSV parser in client-import is naive
File: `src/app/api/dashboard/client-import/route.ts:10-41`

- Hand-rolled `splitCSVLine` does not handle escaped quotes (`""`) or newlines inside quoted fields. Any row like `"Smith, John","jdoe@example.com","note ""with quote"""` breaks.
- Line 182: when a row has no email, generates `import-${Date.now()}-${Math.random()}@placeholder.local`. This defeats the `unique` index's purpose: every import creates a new "client" rather than deduping. With real WP post-event traffic, the Clients table will balloon with junk.

**Proposed change:**
- Replace hand-rolled parser with `csv-parser` (already in dependencies per `package.json:27`).
- Rows missing email → return in the route's response `errors[]` array. UI displays them for manual handling. Do not create placeholder records.

**Test:** CSV fixture containing `"Smith, John",jdoe@example.com,"note ""inside"" text"` round-trips correctly.

#### A3. `overrideAccess: false` sweep
Files:
- `src/app/api/intake/route.ts` lines 19, 31, 38, 53, 70
- `src/app/api/dashboard/client-import/route.ts` lines 72, 155, 177, 195
- `src/app/api/dashboard/actions/route.ts` — all `payload.*` calls
- `src/collections/Clients.ts:114` — `beforeDelete` hook (also missing `req` pass-through)

Currently harmless because there is no RBAC. The day you add any user-scoped access control, these calls silently bypass it. The fix is mechanical (add two props to each call) but must happen before A4 below.

**Rule:** when the call acts on behalf of a user, pass `user: req.user` and `overrideAccess: false`. When the call is system/administrative (intake, imports), leave no `user` and add a code comment documenting intent.

#### A4. Access control model — deferred
All collections currently have `read: () => true`. This is fine while the only reader is the admin dashboard (which goes through Payload's authenticated admin UI), but the moment the WP site or any external client reads data over HTTP, this becomes a business-data leak.

**Deferring because** the right shape depends on Stripe integration (webhooks introduce a third auth pattern — signed headers). Revisit once Stripe is scoped. Until then: the endpoints in A1 are the only public surface and A1 handles them.

---

### B — Stripe integration prerequisites (shapes the data model)

Not in scope for this review pass, but flagged so D-batch data-model work doesn't box us in.

#### B1. Webhook endpoint shape
New route `src/app/api/stripe/webhook/route.ts`:
- Verify `stripe-signature` against `STRIPE_WEBHOOK_SECRET`.
- Idempotency: Stripe retries. Dedupe by `event.id`. Two options: a new `stripe_events` collection as an idempotency log, or a `stripe_event_id` unique index on whatever collection records the event's effect.

#### B2. Data model changes this will require
- Jobs payment fields (lines 171–216) appear to store single-payment state. Stripe produces multiple charges, refunds, partial refunds, disputes. You likely need:
  - A `Transactions` collection linked to Jobs, OR
  - An array field `payments[]` on Jobs with per-entry `stripe_charge_id`.
- `stripe_customer_id` on Clients so returning customers resolve to existing records.

#### B3. Status state machine
Jobs can currently transition from any status to any other. A paid-webhook event should not advance a `delivered` job back to `intake_received`. Define allowed transitions in a `beforeChange` validator. This is also relevant to C3 (dashboard status dropdown) — the dropdown should only offer valid next statuses.

**Impact on this review's plan:** if we centralize status enums (D1) with allowed-transition metadata attached, B3 becomes a one-file change later.

---

### C — Dashboard UX rework (your explicit priority)

#### C1. Rearrange columns & C2. Hide columns
Current: `src/app/(frontend)/dashboard/page.tsx` renders columns in the iteration order of a fixed `STATUS_META` object.

**Options:**
- **Server-persisted preferences** — new `dashboard_preferences` Global in Payload. Survives across browsers. More code, more wiring.
- **localStorage** — per-browser, per-device. Simpler.

**Recommendation:** localStorage. This is a solo-user CRM. Cross-device prefs are low-ROI.

**Shape:**
- New `src/app/(frontend)/dashboard/useColumnPrefs.ts` client hook — reads/writes `dashboard.columnOrder` and `dashboard.hiddenColumns` in localStorage.
- A settings popover in the dashboard header: drag handles to reorder, checkboxes to hide.

#### C3. Move tasks between columns
Current: `src/app/api/dashboard/actions/route.ts` has `ACTION_MAP` covering preset transitions (e.g., "mark delivered"). The underlying mechanism already works — it's just not generalized.

**Options:**
- **Drag-and-drop** — use `@dnd-kit/core` (~18KB). Touches `StatusColumn.tsx`, `JobCard.tsx`, plus a generalized status-update action.
- **Status dropdown on card** — click a chip, pick new status. No new deps. Accessible by default.

**Recommendation:** dropdown. Start here. If you miss drag-drop after a week of real use, add `@dnd-kit` later — the API contract doesn't change.

**Coupling to B3:** if B3 (state machine) lands first, the dropdown only shows valid next-statuses. Cleaner UX.

#### C4. More field access from job cards
File: `src/app/(frontend)/dashboard/components/JobCard.tsx`

Currently visible on cards: pet names, due date, client email (verify from current file).

**Open question — which fields do you want added?**
Candidates:
- Client/job notes (first 80 chars, truncated)
- Last payment date / total paid
- Portfolio readiness flag
- Job type (street vs studio) — already on card via recent commit `7c5af9e`?
- Urgency flag — from recent commit `aaca38a`
- Delivery method

The change is mechanical once you pick: add to `JobCard.tsx`, update the `select` in `dashboard/page.tsx`'s `payload.find()` so we don't over-fetch.

---

### D — Data model consolidations (do before A-batch ships)

#### D1. Centralize status enums
Duplication:
- `src/collections/Jobs.ts:147-158` — Job status select options
- `src/collections/Leads.ts:186-193` — Lead status select options
- `src/app/(frontend)/dashboard/page.tsx` — `ACTIVE_STATUSES`, `STATUS_META` constants
- `src/app/api/dashboard/actions/route.ts` — `ACTION_MAP`
- `src/app/(frontend)/dashboard/leads/page.tsx` — `COLUMNS` array, status-to-column mapping

Renaming one status currently requires edits in 4+ files. TypeScript won't catch a missed spot because each file re-types its own string literals.

**Proposed:** new `src/collections/status.ts`:

```ts
export const JOB_STATUSES = [
  'new',
  'intake_received',
  'in_progress',
  'awaiting_pics_or_payment',
  'ready_to_ship',
  'delivered',
  'portfolio_ready',
] as const
export type JobStatus = typeof JOB_STATUSES[number]

// Optional: transitions map for B3
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  new: ['intake_received'],
  intake_received: ['in_progress', 'awaiting_pics_or_payment'],
  // ...
}
```

Reference `[...JOB_STATUSES]` in the collection `options` array and in every dashboard consumer. Renaming one status → TypeScript surfaces the break everywhere.

#### D2. Address field factory
Duplication:
- `src/collections/Clients.ts:54-64` — `street1 / street2 / city / state / zip / country`
- `src/collections/Jobs.ts:218-232` — shipping: `line1 / line2 / city / state / postal_code / country` (inconsistent naming)

Recent commit `bf69f59` standardized Clients to the full group. Use that as the canonical shape.

**Proposed:** new `src/collections/fields/address.ts` exporting `addressFields({ prefix?, required? })` — a field factory returning the group's inner fields. Called from Clients and Jobs. Single source of truth.

#### D3. Missing indexes
- `Jobs.status` — dashboard filters on this every render.
- `Jobs.due_date` — dashboard sorts and computes overdue on this.
- `Leads.status` — leads pipeline filters on this.

Add `index: true` to each. Next migration picks up the change automatically.

**Test:** `docker-compose exec pp psql -U payload -d payload -c "EXPLAIN SELECT * FROM jobs WHERE status='new';"` — expect index scan, not seq scan.

---

### E — Cleanups (batch at end of pass)

- `src/app/my-route/route.ts` — Payload example stub returning hardcoded JSON. Delete.
- `src/collections/Jobs.ts:6` — `useAsTitle: "id"` shows UUIDs in admin lists. Change to `pet_names` (virtual field) or a new computed `display_name`.
- `tests/e2e/dashboard.e2e.spec.ts` — five commented-out TODO tests. Either finish them or delete them.
- `eslint.config.mjs` — after Zod lands (A1), lift `@typescript-eslint/no-explicit-any` from `warn` to `error`. Blocks new `as any` from creeping in.

---

### F — Deferred (don't do in this pass; listed so they're not forgotten)

- CI workflow / GitHub Actions (`pnpm lint && tsc --noEmit && pnpm test:int` on PR).
- Pre-commit hooks (`husky` + `lint-staged`).
- Test buildout for intake, import, actions routes.
- `pet_names` virtual field recomputed on every read (`Jobs.ts:380-397`) — cache into a real column if/when job count passes ~1000.
- Dashboard top-clients aggregation (`dashboard/page.tsx:99-125`) loads all jobs with `depth: 1` to compute top 5. Replace with a `SELECT client_id, COUNT(*) ... GROUP BY client_id LIMIT 5` raw query or a `select: { client: true }` projection.
- RBAC model (coupled to WP/Stripe decisions — revisit after B scoped).
- Events collection access control (Events out of scope per your instruction).

---

## Execution order

Step-by-step, each with a test and a conventional-commit message. I provide edit instructions; you do the edits. One commit per step.

| # | Batch | Task | Key files | Test |
|---|---|---|---|---|
| 1 | D1 | Centralize status enums (no transitions yet) | new `src/collections/status.ts`; Jobs, Leads, dashboard consumers | `tsc --noEmit` clean after rename |
| 2 | D2 | Shared address field factory | new `src/collections/fields/address.ts`; Clients, Jobs | Admin panel renders address group unchanged |
| 3 | D3 | Indexes on Jobs.status, Jobs.due_date, Leads.status | Jobs.ts, Leads.ts, new migration | `EXPLAIN` shows index scan |
| 4 | A2 | Replace hand-rolled CSV parser with `csv-parser` | client-import route | CSV w/ escaped quotes round-trips |
| 5 | A2 | CSV: reject missing-email rows into `errors[]`; stop generating placeholders | client-import route | Import with 1 rowless email → 1 error, 0 bad records |
| 6 | A1 | Intake: Zod schema + file MIME/size validation | intake route, `package.json` add `zod` | Malformed email → 400; 20MB file → 413 |
| 7 | A1 | Intake: shared-secret `x-intake-key` header | intake route, `.env.example`, README env section | Missing header → 401 |
| 8 | A1 | Intake: in-memory rate limit by IP | intake route | 11th req in 60s → 429 |
| 9 | A3 | `overrideAccess: false` + `req` sweep | intake, client-import, actions, Clients hook | Vitest w/ mock non-admin user |
| 10 | C1+C2 | Dashboard: column reorder + hide (localStorage) | dashboard page + new `useColumnPrefs` hook + settings popover | Reload preserves order/visibility |
| 11 | C3 | Dashboard: status dropdown on card; extend `ACTION_MAP` for any-to-any | JobCard, actions route | Click chip → pick new status → job moves |
| 12 | C4 | Additional fields on cards (pending your list) | JobCard + dashboard `select` | Card renders requested fields |
| 13 | E | Cleanups: delete `my-route`, `useAsTitle` to `pet_names`, dead tests, ESLint bump | various | Lint + type-check green |

## End-to-end verification

After the pass:

```bash
pnpm lint
tsc --noEmit
pnpm test:int
```

Manual smoke:
1. Admin `/dashboard` → reorder columns, hide one, reload → state persists.
2. Click status chip on a job card → pick new status → card moves column.
3. `curl -X POST http://localhost:3000/api/intake` without `x-intake-key` → 401.
4. Valid intake payload → Client matched/created, Job created.
5. `/dashboard/client-import` with a CSV containing `"Smith, John","jdoe@example.com"` → parses correctly; rows missing email shown as errors, not silently created.
6. `EXPLAIN SELECT * FROM jobs WHERE status='new';` → index scan.

## Open questions

Answer when you can; "tbd" is fine. These unblock specific steps.

1. **C4 — which fields** on job cards? Notes? Last payment? Portfolio flag? Job type? Urgency? Delivery method? Pick any subset.
2. **C1/C2 — localStorage or server-persisted** column prefs? My recommendation is localStorage.
3. **C3 — status dropdown** (my recommendation) or drag-drop from day one?
4. **Scope — full 13-step pass, or only A-batch (WP prereqs, steps 4–9) first** to unblock your WordPress cutover?
5. **A4 — access control model**: once you have Stripe scoped, do you want admin-only API access, or a role-aware model with room for a future mobile/iOS client?

## Changelog
- 2026-04-20 — initial draft.
