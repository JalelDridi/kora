# Kora

Tunisian football games in Derja: a daily guess-the-player puzzle, a season simulator and a streak game. In Arabic script, in Arabizi and in French.

In development. The design is in [docs/superpowers/specs](docs/superpowers/specs/2026-10-03-kora-design.md); the decisions taken so far are in [docs/decisions.md](docs/decisions.md).

## Run it

Requires Node 22 or later, pnpm 9 and Docker.

    pnpm install
    pnpm db:up
    pnpm dev

Then open http://localhost:3000.

## Checks

`bash check.sh` runs what CI runs: lint, format, types, unit tests, database tests, build, browser tests and the Lighthouse budget.

## Licence

MIT.
