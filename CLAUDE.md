# Kora

A hub of Tunisian football games in Derja. Public portfolio project with real users as the goal; the commit history, tests and docs are part of the deliverable.

## Commands

- `pnpm dev`: run locally (uses the Docker database via `.env.development`)
- `pnpm db:up`: start local Postgres (Docker, port 5434)
- `bash check-fast.sh`: lint, formatting, types, unit tests, the data check and the database tests (about a minute). Run it before every commit.
- `bash check.sh`: every CI check (adds the build, the browser tests and Lighthouse; several minutes), stopping at the first failure. Run it before every push, and whenever a change touches the app, its styles or its routes.
- Local runs never use the hosted database. Next gives `.env.local` priority over `.env.development`, so hosted database values must not be put in `.env.local`: `pnpm dev`, the tests and Lighthouse all use the Docker database, and the hosted values live only in Vercel.
- New migration: `DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:5434/kora_test pnpm exec prisma migrate dev --name <name>`. The override on the command line targets the local database explicitly, whatever the `.env` files hold.
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
- **Derja copy: drafted by Claude, corrected by Jalel** (since 6 October 2026, P51). Research the Tunisian form (Wikidata `aeb` labels, Tunisian usage); no machine translation, no Modern Standard Arabic where a Derja form exists; mark new strings DRAFT in `docs/strings-for-jalel.md` so he can skim and correct them after they ship.
- **Western digits everywhere.** No letter-spacing or uppercase on translated text. Logical CSS properties only.
- **Vocabulary:** a player is a footballer; the person playing is a visitor.
- **No secrets in the repo.** `.env.example` documents variables; real keys live in `.env.local` and Vercel, and the hosted database values only in Vercel. Never print them.
- **Free tiers only.** No ads, no prizes (Vercel Hobby terms).
- Small conventional commits, one concern each. Tests accompany behaviour; database rules are tested against real Postgres, never mocks.
- Cut features before cutting tests or docs. If something goes wrong mid-task, stop and re-plan.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
