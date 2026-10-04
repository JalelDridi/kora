# Kora

Tunisian football games in Derja: a daily guess-the-player puzzle, a season simulator and a streak game. In Arabic script, in Arabizi and in French.

Live at https://kora-tn.vercel.app (the hub only; the games arrive sprint by sprint). The design is in [docs/superpowers/specs](docs/superpowers/specs/2026-10-03-kora-design.md); the decisions taken so far are in [docs/decisions.md](docs/decisions.md).

## Run it

Requires Node 22 or later, pnpm 9 and Docker.

    pnpm install
    pnpm db:up
    pnpm dev

Then open http://localhost:3000.

## Checks

`bash check.sh` runs what CI runs: lint, format, types, unit tests, database tests, build, browser tests and the Lighthouse budget.

## Data

The footballers come from Wikidata, English and French Wikipedia, Wikimedia Commons and a CC0 results dataset, rebuilt every night and reviewed as a pull request. Every field records which sources agree on it; doubtful fields are reviewed first. Sources, licences and how corrections work: [data/README.md](data/README.md).

## Licence

The code is MIT. The data in `data/` (and the hints and cropped photos to come) is CC BY-SA 4.0, because part of it comes from Wikipedia and CC BY-SA photos; Wikidata and the results dataset are CC0, and Commons photos keep their own licences: [data/LICENSE](data/LICENSE).
