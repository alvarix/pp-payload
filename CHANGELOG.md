# Changelog

Notable changes to `pp-v2`. Dates in YYYY-MM-DD.

## Unreleased

### deploy branch

- **docs** — added `docs/deploy-strategy-2026-04-21.md`. Locks deploy target to Vercel + Supabase (DB + Storage), open intake, variable Stripe amount, stacked-accordion multi-pet, signed-URL upload from day 1 (mission-critical), documented pruning/growth strategy.
- **chore** — renamed `.env-example` to `.env.example`; expanded with `PAYLOAD_ADMIN_EMAIL/PASSWORD`, commented-out Supabase S3 block, commented-out Stripe block.
- **docs** — removed Docker setup block from `README.md`; replaced with Supabase connection-string guidance.

## 2026-04-20

- `docs/project-review-2026-04-20.md` — one-pass audit of the codebase, organized around WP-intake replacement, Stripe integration, and dashboard UX priorities.

## Prior

Entries prior to the changelog's introduction (2026-04-21) are in git history — see `git log`.
