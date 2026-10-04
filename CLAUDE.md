@AGENTS.md

# Kora

A hub of Tunisian football games in Derja. Public portfolio project with real users as the goal; the commit history, tests and docs are part of the deliverable.

## Commands

- `pnpm dev`: run locally (uses the Docker database via `.env.development`)
- `pnpm db:up`: start local Postgres (Docker, port 5434)
- `bash check.sh`: every CI check, in order, stopping at the first failure. Run it before every commit.
- New migration: `DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:5434/kora_test pnpm exec prisma migrate dev --name <name>`. Without the override, Prisma targets the Neon database from `.env.local`.
- `pnpm format`: apply Prettier
- `pnpm deck`: re-render `docs/report/kora-plan.pdf` from its HTML

## Layout

- `src/app/[locale]`: every page; `src/app/api`: route handlers
- `src/i18n`: locales, routing, message loading; `messages/`: all UI strings
- `src/games.ts`: the games on the hub
- `src/db`: Prisma client and database tests (`*.db.test.ts`)
- `prisma/`: schema and migrations; constraints Prisma cannot express are SQL in the migration, described in `docs/schema.md`
- `docs/superpowers/specs`: the design; `docs/superpowers/plans`: one plan per sprint
- `docs/decisions.md`: what Jalel decided, with dates

## Rules

- **Jalel decides wording and architecture.** Propose with a recommendation, then wait. Record the outcome in `docs/decisions.md`.
- **Derja copy is his.** No machine translation in the UI, no Modern Standard Arabic. New strings go to him before they ship.
- **Western digits everywhere.** No letter-spacing or uppercase on translated text. Logical CSS properties only.
- **Vocabulary:** a player is a footballer; the person playing is a visitor.
- **No secrets in the repo.** `.env.example` documents variables; real values live in `.env.local` and Vercel. Never print them.
- **Free tiers only.** No ads, no prizes (Vercel Hobby terms).
- Small conventional commits, one concern each. Tests accompany behaviour; database rules are tested against real Postgres, never mocks.
- Cut features before cutting tests or docs. If something goes wrong mid-task, stop and re-plan.
