# pp-v2

Portfolio/project management CMS built with Payload 3 and Next.js 15.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js](https://nextjs.org/) 15 (App Router) |
| CMS | [Payload](https://payloadcms.com/) 3.72 |
| Database | PostgreSQL 16 (via `@payloadcms/db-postgres`) |
| Styling | Tailwind CSS 4 |
| Rich Text | Lexical (`@payloadcms/richtext-lexical`) |
| Language | TypeScript 5.7 |
| Runtime | Node 20+ |
| Package Manager | pnpm 9+ |

### Collections

- **Users** — admin auth
- **Media** — image uploads with resizing (sharp)
- **Clients**
- **Events**
- **Jobs**

## Local Setup

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

### Start Postgres via Docker

```bash
docker-compose up -d
```

This runs Postgres 16 on port `5432` with:

- user: `payload`
- password: `payload`
- database: `payload`

Data is persisted in a named Docker volume (`pgdata`).

### Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first time you visit, you'll be prompted to create an admin user.

The admin panel is at [http://localhost:3000/admin](http://localhost:3000/admin).

### Useful scripts

```bash
pnpm dev            # start dev server
pnpm devsafe        # clear .next cache and start dev server
pnpm build          # production build
pnpm start          # serve production build
pnpm generate:types # regenerate payload-types.ts
pnpm lint           # ESLint
pnpm test           # run all tests (integration + e2e)
pnpm test:int       # Vitest integration tests
pnpm test:e2e       # Playwright e2e tests
```

## Project Structure

```
src/
  app/           # Next.js App Router pages and API routes
  collections/   # Payload collection configs
  payload.config.ts
  payload-types.ts
```
