# Recorded fixtures

Infobox excerpts from English and French Wikipedia, recorded on 2026-10-04 by the Sprint 1 probe, for parser tests. Text from Wikipedia is licensed under CC BY-SA 4.0; each file is an unmodified excerpt of the article named below, at the revision given.

| File | Article | Revision |
| --- | --- | --- |
| en/ali-maaloul.wikitext | https://en.wikipedia.org/wiki/Ali_Ma%C3%A2loul | 1373102392 |
| en/ellyes-skhiri.wikitext | https://en.wikipedia.org/wiki/Ellyes_Skhiri | 1375979299 |
| en/ferjani-sassi.wikitext | https://en.wikipedia.org/wiki/Ferjani_Sassi | 1364967984 |
| en/firas-chaouat.wikitext | https://en.wikipedia.org/wiki/Firas_Chaouat | 1368598927 |
| en/hannibal-mejbri.wikitext | https://en.wikipedia.org/wiki/Hannibal_Mejbri | 1374146641 |
| en/wahbi-khazri.wikitext | https://en.wikipedia.org/wiki/Wahbi_Khazri | 1377232922 |
| en/yassine-meriah.wikitext | https://en.wikipedia.org/wiki/Yassine_Meriah | 1376866276 |
| en/youssef-msakni.wikitext | https://en.wikipedia.org/wiki/Youssef_Msakni | 1376296884 |
| fr/ali-maaloul.wikitext | https://fr.wikipedia.org/wiki/Ali_Maaloul | 238088457 |
| fr/ellyes-skhiri.wikitext | https://fr.wikipedia.org/wiki/Ellyes_Skhiri | 239645421 |
| fr/ferjani-sassi.wikitext | https://fr.wikipedia.org/wiki/Ferjani_Sassi | 239899361 |
| fr/firas-chaouat.wikitext | https://fr.wikipedia.org/wiki/Firas_Chaouat | 239411402 |
| fr/hannibal-mejbri.wikitext | https://fr.wikipedia.org/wiki/Hannibal_Mejbri | 239259366 |
| fr/wahbi-khazri.wikitext | https://fr.wikipedia.org/wiki/Wahbi_Khazri | 238857106 |
| fr/yassine-meriah.wikitext | https://fr.wikipedia.org/wiki/Yassine_Meriah | 239852028 |
| fr/youssef-msakni.wikitext | https://fr.wikipedia.org/wiki/Youssef_Msakni | 238805526 |

`expected.json` holds the values read by eye from these files (Task 1 step 6); it is the truth the parsers are tested against.

Other recorded fixtures:

- `../../__fixtures__/commons.json`: file metadata (licence, artist, size) from the Wikimedia Commons API for the players' page images; each image keeps the licence stated in its own metadata.
- `../../wikidata/__fixtures__/players.json`: a Wikidata Query Service response (Wikidata is CC0).
- `../../__fixtures__/results-sample.csv`: rows from martj42/international_results (CC0): the header, the last 40 matches involving Tunisia and the last 5 other matches.

## Squad lists (`squads/`)

Squad-list sections (decision P42), recorded on 2026-10-04 by the squad-list research (`data-sources-2b-wikipedia-squads.md`), for the tests of `wiki/squads.ts`. Each file is an unmodified excerpt of the article named below: the list's heading and the sections that follow it as far as the parser reads (plus the next one where a test needs it). Text from Wikipedia is licensed under CC BY-SA 4.0. The research asked for content and timestamps, not revision ids, so each row gives the revision by its timestamp; the article's history at that time identifies it.

| File | Article | Revision saved at | What it pins |
| --- | --- | --- | --- |
| squads/en/us-monastir-squad.wikitext | https://en.wikipedia.org/wiki/US_Monastir_(football) | 2026-09-15T12:11:57Z | current, `{{updated\|15 September, 2026}}` (the comma form), "Out on loan" |
| squads/en/club-africain-squad.wikitext | https://en.wikipedia.org/wiki/Club_Africain | 2026-09-26T21:15:55Z | current, 27 September 2026; the plain-text "Houssem Romdhane" row |
| squads/en/esperance-squad.wikitext | https://en.wikipedia.org/wiki/Esp%C3%A9rance_Sportive_de_Tunis | 2026-10-03T21:46:46Z | undated; reserve team, "Out on loan", "Other players under contract", then "Retired numbers" |
| squads/en/ca-bizertin-squad.wikitext | https://en.wikipedia.org/wiki/CA_Bizertin | 2026-08-14T14:21:29Z | stale: `{{updated\|13 January 2025}}` on a page edited in August 2026 |
| squads/en/js-el-omrane-squad.wikitext | https://en.wikipedia.org/wiki/JS_El_Omrane | 2026-09-26T21:45:19Z | the Ben Amor namesake link |
| squads/en/es-zarzis-squad.wikitext | https://en.wikipedia.org/wiki/ES_Zarzis | 2026-09-22T21:02:30Z | current, with the stale Romdhane row |
| squads/en/cs-sfaxien-squad.wikitext | https://en.wikipedia.org/wiki/CS_Sfaxien | 2026-09-14T21:26:50Z | lowercase `{{fs player}}` |
| squads/en/cs-hammam-lif-squad.wikitext | https://en.wikipedia.org/wiki/CS_Hammam-Lif | 2026-09-29T10:21:23Z | an italic "As of 27 September 2026" line instead of `{{updated}}` |
| squads/en/tunisia-current-squad.wikitext | https://en.wikipedia.org/wiki/Tunisia_national_football_team | 2026-10-01T15:57:39Z | 26 `{{nat fs g player}}` rows, "correct as of 28 September 2026", then "Recent call-ups" |
| squads/fr/club-africain-effectif.wikitext | https://fr.wikipedia.org/wiki/Club_africain_(football) | 2026-09-13T18:41:46Z | 2026-2027, `{{Feff joueur}}` with `jour/mois/an`, `nolink`, `dab`, `{{Feff staff}}` |
| squads/fr/cs-sfaxien-effectif.wikitext | https://fr.wikipedia.org/wiki/Club_sportif_sfaxien_(football) | 2026-09-29T17:03:00Z | 2024-2025: stale |

`squads/pageprops-fr.json`: a recorded `prop=pageprops` answer of French Wikipedia (squad-list research, 4 October 2026), cut to four pages: one reached through a redirect, one missing. Page titles and Wikidata ids only.
