# pp-v2

CRM and portfolio backend for a pet portrait business. Built with Payload 3 and Next.js 15, backed by PostgreSQL.

Handles client intake, job tracking, portfolio management, and events. The public-facing shop runs on a separate WordPress site - see [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) for that plugin.

## Collections

**Clients** - core CRM entity. Stores contact info, consent flags (marketing, portfolio), and tags for segmentation. A `jobs` join field gives a reverse-lookup of all jobs for a given client. Deletion is blocked if linked jobs exist.

**Jobs** - the main work unit. Each job belongs to a client and tracks:
- One or more pets (name, sex, breed, personality, social handle, reference photos)
- Status through a 7-stage workflow: `new → intake_received → in_progress → awaiting_pics_or_payment → ready_to_ship → delivered → portfolio_ready`
- Payment records (method, amount, date) and Stripe IDs
- Shipping address
- A portfolio group with images (tagged by role), testimonial, portfolio status, and featured flag

**Leads** - outreach pipeline for pop-up event collaborations. Tracks business info, contact details, qualification (dog-friendly, event space, pop-up history), fit scoring, and outreach status through a 7-stage workflow: `researched → contacted → responded → meeting_scheduled → confirmed → declined → no_response`. Organized in tabs: Business Info, Contact, Qualification, Outreach.

**Events** - calendar/marketing events with slug, dates, location, rich text description, image, and publish status.

**Media** - image uploads with sharp resizing. Alt text is auto-generated from filename on upload.

**Users** - admin authentication.

## API routes

`POST /api/intake` - public intake form endpoint. Accepts client contact info, pet data, and photo uploads. Creates or updates the client by email and creates a job. Used by the intake form at `/intake`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| CMS | Payload 3.72 |
| Database | PostgreSQL 16 via `@payloadcms/db-postgres` |
| Styling | Tailwind CSS 4 |
| Rich text | Lexical |
| Language | TypeScript 5.7 |
| Runtime | Node 20+ |
| Package manager | pnpm 9+ |

## Local setup

### Prerequisites

- Node >= 20.9.0
- pnpm >= 9
- Docker (for Postgres)

### Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://payload:payload@127.0.0.1:5432/payload
PAYLOAD_SECRET=your-secret-here
```

### Start Postgres

```bash
docker-compose up -d
```

Runs Postgres 16 on port `5432`. Credentials: `payload / payload`, database: `payload`. Data persists in the `pgdata` Docker volume.

### Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). First visit prompts for admin user creation.

Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

### Scripts

```bash
pnpm dev              # start dev server
pnpm devsafe          # clear .next cache and start
pnpm build            # production build
pnpm start            # serve production build
pnpm generate:types   # regenerate payload-types.ts after schema changes
pnpm lint             # ESLint
pnpm test             # all tests (integration + e2e)
pnpm test:int         # Vitest integration tests
pnpm test:e2e         # Playwright e2e tests
```

### Data import

Import scripts live in `data_import/`. All require the dev server to be running.

```bash
# Import client leads (past collaborators) into the Clients collection
PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-leads.mjs

# Import all leads (past collaborators + prospects) into the Leads collection
PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-all-leads.mjs

# Dry run either script (prints what would be created, no changes)
DRY_RUN=1 PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-all-leads.mjs
```

| Script | Target collection | Data file | Deduplicates on |
|---|---|---|---|
| `import-leads.mjs` | Clients | `leads.json` | email |
| `import-all-leads.mjs` | Leads | `all-leads-seed.json` | name |

## Project structure

```
src/
  app/
    (frontend)/         Public-facing pages (intake form, events)
    api/                Custom API routes
  collections/          Payload collection definitions
  payload.config.ts
  payload-types.ts      Auto-generated - do not edit manually
data_import/            CSV migration scripts from legacy system
docs/                   Internal documentation
tests/                  Vitest integration + Playwright e2e
```

## Security notes

- `pp-wp` and `pp-wp.pub` in the project root are SSH keys used for server communication. **These must not be committed to version control.** Add them to `.gitignore` and store securely.
- All collections currently have open read access (`() => true`). Role-based access control should be implemented before exposing the API publicly.
- The intake endpoint is unauthenticated - consider adding an API key check for production.

## WordPress integration

This backend pairs with the [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) WordPress plugin, which handles the public adoption shop. The two systems are separate deployments. Clients who complete a purchase through WordPress can be looked up or created here via the `/api/intake` endpoint.
