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
