// Builds the name-search fixtures from the research CSV, once:
//   node scripts/name-fixtures.ts
// The CSV stays out of the repo; the two JSON files it writes are committed
// and are all the tests read.
//   corpus.json:   the 107 footballers (Wikidata id, en label, ar label, and
//                  a fame that follows the CSV's order, which is by sitelinks)
//   variants.json: the 879 test rows (variant, expected ids, source)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const csvPath = path.join(
  root,
  ".superpowers/research/sprint-2-name-variants.csv",
);
const out = path.join(root, "src/engine/names/__fixtures__");

/** RFC 4180 rows: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const [header, ...body] = parseCsv(
  readFileSync(csvPath, "utf8").replace(/^\uFEFF/, ""),
);
const col = (name: string) => header.indexOf(name);
const records = body
  .filter((r) => r.length === header.length)
  .map((r) => ({
    section: r[col("section")],
    wikidataId: r[col("wikidataId")],
    variant: r[col("variant")],
    source: r[col("source")],
  }));

const order: string[] = [];
const latin = new Map<string, string>();
const arabic = new Map<string, string>();
for (const r of records.filter((r) => r.section === "corpus")) {
  if (!order.includes(r.wikidataId)) order.push(r.wikidataId);
  if (r.source === "wikidata-label-en") latin.set(r.wikidataId, r.variant);
  if (r.source === "wikidata-label-ar") arabic.set(r.wikidataId, r.variant);
}

const corpus = order.map((id, rank) => ({
  id,
  nameLatin: latin.get(id) ?? null,
  nameArabic: arabic.get(id) ?? null,
  fame: order.length - rank,
}));

const variants = records
  .filter((r) => r.section === "test")
  .map((r) => ({
    variant: r.variant,
    expected: r.wikidataId.split("|").map((s) => s.trim()),
    source: r.source,
  }));

writeFileSync(
  path.join(out, "corpus.json"),
  JSON.stringify(corpus, null, 2) + "\n",
);
writeFileSync(
  path.join(out, "variants.json"),
  JSON.stringify(variants, null, 2) + "\n",
);
console.log(`corpus ${corpus.length}, variants ${variants.length}`);
