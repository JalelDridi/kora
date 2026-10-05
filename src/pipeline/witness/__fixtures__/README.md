# Synthetic fixtures (decision S28)

Every file here is made up: invented names, ids, clubs, dates and numbers, written in the tag, class and link shapes of the two sites' pages. No page of Transfermarkt or national-football-teams.com, nor any excerpt or value from one, is committed: their terms forbid republishing their content.

| File | Shape taken from | Status |
| --- | --- | --- |
| `tm-league.html` | a real Transfermarkt league page (research probe, 4 October 2026) | shape checked locally against that page: 16 clubs, 16 squad paths |
| `tm-squad.html` | a real Transfermarkt squad page, compact view (sample run, 5 October 2026): header "# / Player / Age / Nat. / Contract / Market value", no birth-date column, transfer badges | shape checked locally against the sample; the "on loan from" badge is a guess (no loan in the sample), UNVERIFIED |
| `tm-profile.html` | Transfermarkt's usual profile header | the parser reads the real sample profile (id, name, birth date, club) |
| `nft-country.html` | a real national-football-teams.com country page (research probe, 4 October 2026) | shape checked locally against that page: every player row with a birth date, a club and a FIFA count; dated matches; the last update |
| `nft-player.html` | a real national-football-teams.com player page (sample run, 5 October 2026): the chart's `dataProvider` and the career table | shape checked locally against the sample: both give the same FIFA count; the youth row is invented |

The sample run saves the real pages to the private folder (`pages/<site>/sample-*.html`), never to the repo. The `local real pages` tests read them there when they exist and are skipped otherwise.
