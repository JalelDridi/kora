# Synthetic fixtures (decision S28)

Every file here is made up: invented names, ids, clubs, dates and numbers, written in the tag, class and link shapes of the two sites' pages. No page of Transfermarkt or national-football-teams.com, nor any excerpt or value from one, is committed: their terms forbid republishing their content.

| File | Shape taken from | Status |
| --- | --- | --- |
| `tm-league.html` | a real Transfermarkt league page (research probe, 4 October 2026) | shape checked locally against that page: 16 clubs, 16 squad paths |
| `tm-squad.html` | Transfermarkt's usual squad-page markup, as best known | UNVERIFIED until the sample run (`pnpm data:witness --live --sample`) |
| `tm-profile.html` | Transfermarkt's usual profile header, as best known | UNVERIFIED until the sample run |
| `nft-country.html` | a real national-football-teams.com country page (research probe, 4 October 2026) | shape checked locally against that page: every player row with a birth date, a club and a FIFA count; dated matches; the last update |
| `nft-player.html` | a guess: a career table by year with a total row | UNVERIFIED until the sample run |

The sample run saves the real pages to the private folder (`pages/<site>/sample-*.html`), never to the repo. The `local real pages` tests read them there when they exist and are skipped otherwise.
