# Addendum: confidence per field (P26, P27) for Tasks 6–10

**Nothing in this addendum was run.** No build, test, request or commit. Code and expected outputs are written from the plan, `src/pipeline/types.ts`, `results.ts`, `prisma/schema.prisma`, the fixtures and `.superpowers/research/data-confidence*.{md,csv}`. Implementers apply each delta with their task brief. Code is written dense to keep this file short; `pnpm format` reflows it.

Contents: rule (§1), types (§2), Task 6 (§3), Task 7 (§4), Task 8 (§5), Task 9 (§6), Task 10 (§7), skipped rows (§8, added after Task 4's review), typeless package (§9), cost (§10), open points (§11).

## 1. The rule, made computable

### 1.1 Terms

- **Vote**: `{ source, value, asOf }` from one source for one field. Voters in Sprint 1: `enwiki`, `frwiki`, `wikidata`. A missing or unparseable value is no vote (an unresolved club title is no vote, not a disagreement).
- **Independent sources**: distinct `SourceId`s among the votes giving the chosen value. en, fr and Wikidata copy each other (research §2), so **high means consistent, not proven**. Arabic Wikipedia is not fetched and never votes.
- **martj42 never votes.** `goalscorers.csv` names a scorer for about 35% of Tunisia's goals: its count is a **floor** for goals. `results.csv` gives a **ceiling** for caps over the national years. Floor and ceiling can only make a field low, never confirm it.
- **Chosen**: the value the merge picks under D-S1-2/3/4/7, unchanged. Confidence rates it; it never changes it.
- **Fresh**: `asOf` exists and `today − asOf < 365` days. **Close in time**: dates at most 90 days apart (the research's thresholds, not measured optima).
- **Agree**: exact equality. Club: same Wikidata id, or both "none". Birth date: same ISO date. Position: same line. Caps/goals: same integer. Latin name: equal after accent-folding, article titles without a trailing "(…)". History: same set of resolved club ids.
- **Override** by Jalel: always `high`, `agreeing: ["override"]`, note "decided by Jalel". Nothing else is computed for that field.

### 1.2 Counts: caps and goals (dated; a count only grows)

For each vote `v` that differs from the chosen `c`: `v > c` → **conflict** (newer but lower: `c` is the newest dated value, so a higher one is older or undated); same `asOf` (including both undated) → **conflict**; `v` dated and newer than `c` → **conflict**; otherwise (`v < c`, older or undated) → **explained by dates**. Goals under the martj42 floor or caps over the results ceiling → **conflict** plus a flag.

Then: any conflict → **low**; else ≥ 2 agreeing sources → **high** (the newest dated vote is then among them); else `c` fresh → **medium**; else **low** (one undated source, or one over 12 months old).

### 1.3 Dated values: current club and club history

For each differing vote: undated (Wikidata's open P54) → **ignored as stale** (Wikidata disagrees on club in 18 of 28 sheet rows); dated and newer than `c` → conflict; dated within 90 days of `c` → conflict unless `explained(older, newer)` (history only: the older set is a subset of the newer); `c` undated while `v` dated → conflict. Then the same levels as 1.2.

### 1.4 Undated values

Birth date, position line, position wording, Latin name, governorate, birthplace, Arabic name, photo: ≥ 2 agreeing and no dissent → **high**; ≥ 2 agreeing and more agreeing than dissenting sources → **medium**; otherwise **low**.

### 1.5 Truth table (Sprint 1 sources; no inflation)

| Field | Votes the pipeline has | High | Medium | Low | Best in Sprint 1 |
| --- | --- | --- | --- | --- | --- |
| `caps` | en, fr (`capsAsOf`), Wikidata P1350 (undated); ceiling | ≥2 agree, no conflict | one fresh value, others older and lower | conflict; single undated or > 12 months; over ceiling | high |
| `goals` | same as caps; floor from goalscorers | same | same | same; under floor | high |
| `clubId` | en, fr (`clubsAsOf`; "none" is a value), one open Wikidata P54 (undated) | ≥2 agree, no newer or close other value | single fresh; others > 90 days older | newer or close other value; single undated or old | high |
| `history` | en, fr resolved club sets (`clubsAsOf`), Wikidata P54 set | equal sets ≥2 | single fresh | as club | high, rarely (French `?` rows differ) |
| `birthDate` | Wikidata P569; en `birth_date` and fr `date de naissance` **only with Step 6.0** | ≥2 agree, none differs | majority | otherwise | **low without Step 6.0**, high with it |
| `position` | Wikidata first mappable line, en line, fr line | all agree | majority | chosen is the minority | high; under D-S1-7 a Wikidata-only line is **low** (about 9 of 30 in the sheet) |
| `positionDetail` | its wording's line vs the same three lines | as position | as position | no line, or a minority line | high |
| `nameLatin` | Wikidata label, en title, fr title | ≥2 agree | majority | otherwise | high |
| `governorate`, `birthPlace`, `nameArabic` | Wikidata only | — | — | always | **low** until an override (fits D-S1-4: manual birthplaces for answers in Sprint 2) |
| `photo` | Commons via P18 only | — | — | always | **low** (nobody confirms who is pictured) |

The four single-source fields appear as counts in the report, not one line per footballer (§4).

Against the sheet (pipeline sources only, no Arabic vote): every caps, goals and club row of research §4 gets the same level. Positions differ for the 9 Wikidata dissents (sheet: majority chosen, medium; pipeline: Wikidata chosen, low): that is D-S1-7 showing through (open point 1).

## 2. Types (`src/pipeline/types.ts`)

All additions are optional or new union members: Tasks 3–5 code still compiles. No enum; the list is a `const` array like `lines`.

```ts
export type Confidence = "high" | "medium" | "low";
export const confidences: readonly Confidence[] = ["high", "medium", "low"];
// Provenance gains, after `by?`:
  /** Decision P26, set by the merge. Optional so Tasks 3–5 compile; validatePool requires it. */
  confidence?: Confidence;
  /** The sources that give the chosen value; ["override"] when Jalel decided. */
  agreeing?: SourceId[];
  /** Why the level is what it is, in a few words. */
  confidenceNote?: string;
```

`Infobox` gains (Step 6.0) `/** ISO birth date; absent when the parser does not read it. */ birthDate?: string | null;`. `ProvenancedField` gains `| "goals"` (comment: `"caps" covers caps and capsAsOf; "goals" has its own confidence`). `FlagKind` gains `| "caps-above-ceiling" | "goals-below-floor" | "caps-row-skipped" | "career-row-skipped"`. `SkippedRow` and `Infobox.skipped` come from Task 4's fix round (§8).

## 3. Task 6 delta

**Create** `src/pipeline/confidence.ts`, `confidence.test.ts`, `goalscorers.ts`, `goalscorers.test.ts`, `wiki/birth.ts`. **Modify** `merge.ts`, `merge.test.ts`, `types.ts`; with Step 6.0 also `wiki/infobox-en.ts`, `wiki/infobox-fr.ts`, `wiki/infobox.test.ts`. `MergeContext` gains `goalsFloor?: Map<string, number>` (optional, so Task 7's test contexts need no change).

### Step 6.0 (recommended; controller decides): birth date from the infoboxes

Without it every birth date has one source, so it is **low for every footballer** and P27 would let nobody be a Sprint 2 answer. The fixtures hold the fields.

`src/pipeline/wiki/birth.ts`:

```ts
import { parseFrDate } from "./dates.ts";
/** {{birth date and age|1993|7|2|df=y}}, named parameters allowed before the numbers. */
export function parseEnBirth(text: string): string | null {
  const m = /\{\{\s*birth date(?: and age)?\s*\|\s*(?:[a-z]+\s*=[^|}]*\|\s*)*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(text);
  const [mo, d] = m ? [Number(m[2]), Number(m[3])] : [0, 0];
  return m && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}
/** {{date de naissance|2|7|1993|âge=oui}} or plain "21 janvier 2003". */
export function parseFrBirth(text: string): string | null {
  return parseFrDate(text.replace(/\{\{\s*date de naissance\s*\|/i, "{{date|"));
}
```

Add `birthDate: parseEnBirth(get("birth_date")),` to `parseEnInfobox`'s return and `birthDate: parseFrBirth(get("date de naissance")),` to `parseFrInfobox`'s. In `infobox.test.ts` the two whole-object `toEqual` cases gain `birthDate: "1990-01-01"` (en Ali Maâloul) and `birthDate: "1993-07-02"` (fr Yassine Meriah); add:

```ts
it("reads birth dates in both languages", () => expect([enBox("yassine-meriah")?.birthDate, enBox("youssef-msakni")?.birthDate, frBox("hannibal-mejbri")?.birthDate, frBox("ellyes-skhiri")?.birthDate]).toEqual(["1993-07-02", "1990-10-28", "2003-01-21", "1995-05-10"]));
```

### Step A: `src/pipeline/confidence.ts`

```ts
import { plainLatin } from "./places.ts";
import { latestPlayed } from "./results.ts";
import type { Confidence, FlagKind, Line, Match, Provenance, ProvenancedField, SourceId } from "./types.ts";
// Decision P26: every field carries high, medium or low, with the sources that
// give the chosen value. Pure; mergePlayer calls rateFields once per footballer.
// en, fr and Wikidata copy each other: "high" means consistent, not proven.
// martj42 never votes: a floor for goals, a ceiling for caps.
export const FRESH_DAYS = 365;
export const CLOSE_DAYS = 90;
export type Vote<T> = { source: SourceId; value: T; asOf: string | null };
export type Rating = { confidence: Confidence; agreeing: SourceId[]; confidenceNote?: string };
type Found = { kind: FlagKind; detail: string };
type ProvenanceMap = Partial<Record<ProvenancedField, Provenance>>;
export const OVERRIDE_RATING: Rating = { confidence: "high", agreeing: ["override"], confidenceNote: "decided by Jalel" };
/** Fields two sources can confirm in Sprint 1; the rest have one source. */
export const CROSS_CHECKED: readonly ProvenancedField[] = ["caps", "goals", "clubId", "birthDate", "position", "positionDetail", "history", "nameLatin"];
export const SINGLE_SOURCE: readonly ProvenancedField[] = ["governorate", "birthPlace", "nameArabic", "photo"];
/** Infobox fields whose skipped rows touch caps and goals (§8). */
export const NATIONAL_FIELD = /nationalteam|sélection nationale/i;
export function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
const fresh = (asOf: string | null, today: string) => asOf !== null && daysBetween(asOf, today) < FRESH_DAYS;
const shown = (value: unknown) => (value === null ? "none" : Array.isArray(value) ? `${value.length} clubs` : String(value));
const say = (v: Vote<unknown>) => `${v.source} ${shown(v.value)} (${v.asOf ?? "undated"})`;
const withChosen = <T>(c: Vote<T>, votes: Vote<T>[]) => (votes.some((v) => v.source === c.source) ? votes : [c, ...votes]);
const sourcesOf = <T>(votes: Vote<T>[]) => [...new Set(votes.map((v) => v.source))];
function levels(c: Vote<unknown>, agreeing: SourceId[], others: number, conflicts: string[], today: string): Rating {
  if (conflicts.length > 0) return { confidence: "low", agreeing, confidenceNote: conflicts.join("; ") };
  if (agreeing.length >= 2) return { confidence: "high", agreeing };
  if (fresh(c.asOf, today)) return { confidence: "medium", agreeing, confidenceNote: others > 0 ? "one fresh source; the others are explained by their dates" : "one fresh source" };
  return { confidence: "low", agreeing, confidenceNote: c.asOf === null ? "one undated source" : `one source, as of ${c.asOf}` };
}
/** Caps and goals: a count only grows, so an older, lower count is explained. */
export function rateCount(input: { chosen: Vote<number>; votes: Vote<number>[]; today: string; floor?: number | null; ceiling?: number | null }): Rating {
  const c = input.chosen;
  const all = withChosen(c, input.votes);
  const agreeing = sourcesOf(all.filter((v) => v.value === c.value));
  const conflicts: string[] = [];
  for (const v of all) {
    if (v.value === c.value) continue;
    if (v.value > c.value) conflicts.push(`${say(v)} is higher`);
    else if (v.asOf === c.asOf) conflicts.push(`${say(v)} has the same date`);
    else if (v.asOf !== null && (c.asOf === null || v.asOf > c.asOf)) conflicts.push(`${say(v)} is newer and lower`);
  }
  if (input.floor != null && c.value < input.floor) conflicts.push(`martj42 lists ${input.floor} goals by him`);
  if (input.ceiling != null && c.value > input.ceiling) conflicts.push(`Tunisia played ${input.ceiling} matches in his national years`);
  return levels(c, agreeing, all.length - agreeing.length, conflicts, input.today);
}
/** Club and history: an undated other value is stale; a dated one must be over 90 days older. */
export function rateDated<T>(input: { chosen: Vote<T>; votes: Vote<T>[]; today: string; same: (a: T, b: T) => boolean; explained?: (older: T, newer: T) => boolean }): Rating {
  const { chosen: c, same } = input;
  const all = withChosen(c, input.votes);
  const agreeing = sourcesOf(all.filter((v) => same(v.value, c.value)));
  const conflicts: string[] = [];
  for (const v of all) {
    if (same(v.value, c.value) || v.asOf === null) continue;
    if (c.asOf === null) conflicts.push(`${say(v)} is dated, the chosen value is not`);
    else if (v.asOf > c.asOf) conflicts.push(`${say(v)} is newer`);
    else if (daysBetween(v.asOf, c.asOf) <= CLOSE_DAYS && !input.explained?.(v.value, c.value)) conflicts.push(`${say(v)} is within ${CLOSE_DAYS} days`);
  }
  return levels(c, agreeing, all.length - agreeing.length, conflicts, input.today);
}
/** Values without dates: agreement and majority only. */
export function rateUndated<T>(input: { chosen: Vote<T>; votes: Vote<T>[]; same?: (a: T, b: T) => boolean }): Rating {
  const same = input.same ?? ((a: T, b: T) => a === b);
  const all = withChosen(input.chosen, input.votes);
  const agreeing = sourcesOf(all.filter((v) => same(v.value, input.chosen.value)));
  const dissent = all.filter((v) => !same(v.value, input.chosen.value));
  const differs = dissent.map(say).join(", ");
  if (agreeing.length >= 2 && dissent.length === 0) return { confidence: "high", agreeing };
  if (agreeing.length >= 2 && agreeing.length > sourcesOf(dissent).length) return { confidence: "medium", agreeing, confidenceNote: `majority; ${differs} differs` };
  return { confidence: "low", agreeing, confidenceNote: dissent.length === 0 ? "one source" : `${differs} differs` };
}
/** §8: never high on the word of an infobox that skipped rows of this kind. */
export function capForSkipped(rating: Rating, tainted: SourceId[]): Rating {
  if (rating.confidence !== "high" || tainted.length === 0) return rating;
  if (rating.agreeing.filter((s) => !tainted.includes(s)).length >= 2) return rating;
  return { ...rating, confidence: "medium", confidenceNote: `${tainted.join(", ")} skipped rows of this field` };
}
/** Tunisia matches played from 1 January of the first national year to the as-of date; null when unknowable. */
export function capsCeiling(matches: Match[], fromYear: number | null, toYear: number | null, asOf: string | null): number | null {
  const latest = latestPlayed(matches);
  const earliest = matches.map((m) => m.date).sort()[0];
  const start = `${fromYear}-01-01`;
  const end = toYear !== null ? `${toYear}-12-31` : asOf;
  // The file must cover the whole span, or the count is too low to be a ceiling.
  if (fromYear === null || latest === null || end === null || end > latest || earliest > start) return null;
  return matches.filter((m) => m.homeScore !== null && m.date >= start && m.date <= end).length;
}
export const sameName = (a: string, b: string) => plainLatin(a).trim() === plainLatin(b).trim();
export const titleName = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, "");
export const sameSet = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((q) => b.includes(q));
export const subset = (older: string[], newer: string[]) => older.every((q) => newer.includes(q));
export type Evidence = {
  caps: Vote<number>[]; goals: Vote<number>[]; goalsFloor: number | null; capsCeiling: number | null;
  clubId: Vote<string | null>[]; history: Vote<string[]>[]; birthDate: Vote<string>[]; position: Vote<Line>[]; nameLatin: Vote<string>[];
  /** Sources whose infobox skipped rows (§8). */
  skipped: { national: SourceId[]; career: SourceId[] };
};
export type Chosen = {
  caps: number; goals: number; clubQid: string | null; history: string[]; birthDate: string | null;
  position: Line | null; positionDetailLine: Line | null; nameLatin: string | null;
};
/** Rates every field that has provenance. Overrides are high; the rest follow §1. */
export function rateFields(provenance: ProvenanceMap, chosen: Chosen, ev: Evidence, today: string): { provenance: ProvenanceMap; flags: Found[] } {
  const out: ProvenanceMap = {};
  const flags: Found[] = [];
  for (const field of Object.keys(provenance) as ProvenancedField[]) {
    const p = provenance[field]!;
    if (p.source === "override") {
      out[field] = { ...p, ...OVERRIDE_RATING };
      continue;
    }
    const vote = <T>(value: T): Vote<T> => ({ source: p.source, value, asOf: p.asOf ?? null });
    let r: Rating;
    switch (field) {
      case "caps":
        r = capForSkipped(rateCount({ chosen: vote(chosen.caps), votes: ev.caps, today, ceiling: ev.capsCeiling }), ev.skipped.national);
        if (ev.capsCeiling !== null && chosen.caps > ev.capsCeiling) flags.push({ kind: "caps-above-ceiling", detail: `${chosen.caps} caps; Tunisia played ${ev.capsCeiling} matches in his national years` });
        break;
      case "goals":
        r = capForSkipped(rateCount({ chosen: vote(chosen.goals), votes: ev.goals, today, floor: ev.goalsFloor }), ev.skipped.national);
        if (ev.goalsFloor !== null && chosen.goals < ev.goalsFloor) flags.push({ kind: "goals-below-floor", detail: `${chosen.goals} goals; martj42 lists ${ev.goalsFloor} goals by him` });
        break;
      case "clubId":
        r = capForSkipped(rateDated({ chosen: vote(chosen.clubQid), votes: ev.clubId, today, same: (a, b) => a === b }), ev.skipped.career);
        break;
      case "history":
        r = capForSkipped(rateDated({ chosen: vote(chosen.history), votes: ev.history, today, same: sameSet, explained: subset }), ev.skipped.career);
        break;
      case "birthDate": r = rateUndated({ chosen: vote(chosen.birthDate), votes: ev.birthDate }); break;
      case "position": r = rateUndated({ chosen: vote(chosen.position), votes: ev.position }); break;
      case "positionDetail": r = rateUndated({ chosen: vote(chosen.positionDetailLine), votes: chosen.positionDetailLine === null ? [] : ev.position }); break;
      case "nameLatin": r = rateUndated({ chosen: vote(chosen.nameLatin ?? ""), votes: ev.nameLatin, same: sameName }); break;
      default: r = rateUndated({ chosen: vote(null), votes: [] }); // one source: low
    }
    out[field] = { ...p, ...r };
  }
  return { provenance: out, flags };
}
/** P27: what a Chkoun? puzzle shows (club and its country, position, age, caps), plus the governorate or, born abroad, the birthplace. */
export const CHKOUN_FIELDS: readonly ProvenancedField[] = ["clubId", "position", "birthDate", "caps"];
/** Active footballers with no low field a Chkoun? puzzle shows. $1 = CHKOUN_FIELDS. Data for Sprint 2. */
export const ANSWER_READY_SQL = `
SELECT p.id FROM players p
WHERE p.pool_active AND NOT EXISTS (
  SELECT 1 FROM jsonb_each(p.provenance) AS e(field, entry)
  WHERE (e.field = ANY($1::text[]) OR e.field = CASE WHEN p.governorate IS NULL THEN 'birthPlace' ELSE 'governorate' END)
    AND e.entry->>'confidence' = 'low')
ORDER BY p.id`;
```

### Step B: `src/pipeline/goalscorers.ts` (pure; fetched in Task 8)

```ts
import { plainLatin } from "./places.ts";
import { parseCsvLine } from "./results.ts";
import type { WdPlayer } from "./types.ts";
// martj42 goalscorers.csv (CC0). It names a scorer for about 35% of Tunisia's
// goals, so a count is a floor, never a total.
export const GOALSCORERS_URL = "https://raw.githubusercontent.com/martj42/international_results/master/goalscorers.csv";
const fold = (name: string) => plainLatin(name).replace(/[^a-z]+/g, " ").trim();
/** [folded scorer name, goals] for Tunisia, own goals left out; an array so the cache keeps it as JSON. */
export function tunisiaScorers(csv: string): [string, number][] {
  const [header = "", ...rows] = csv.replace(/\r/g, "").split("\n").filter(Boolean);
  const columns = parseCsvLine(header);
  if (!["team", "scorer", "own_goal"].every((c) => columns.includes(c))) throw new Error("goalscorers.csv lacks team, scorer or own_goal");
  const col = { team: columns.indexOf("team"), scorer: columns.indexOf("scorer"), own: columns.indexOf("own_goal") };
  const counts = new Map<string, number>();
  for (const row of rows.map(parseCsvLine)) {
    if (row[col.team] !== "Tunisia" || row[col.own] === "TRUE" || !row[col.scorer]) continue;
    counts.set(fold(row[col.scorer]), (counts.get(fold(row[col.scorer])) ?? 0) + 1);
  }
  return [...counts];
}
/** A floor per Wikidata id, only for names exactly one footballer answers to. */
export function goalsFloors(scorers: [string, number][], players: WdPlayer[]): Map<string, number> {
  const owners = new Map<string, Set<string>>();
  for (const p of players) for (const key of [p.nameEn, p.nameFr, ...p.aliases].map((n) => (n ? fold(n) : "")).filter(Boolean)) owners.set(key, (owners.get(key) ?? new Set<string>()).add(p.qid));
  const floors = new Map<string, number>();
  for (const [key, goals] of scorers) {
    const who = owners.get(key);
    if (who?.size === 1) floors.set([...who][0], (floors.get([...who][0]) ?? 0) + goals);
  }
  return floors;
}
```

`src/pipeline/goalscorers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { goalsFloors, tunisiaScorers } from "./goalscorers.ts";
import type { WdPlayer } from "./types.ts";
const csv = ["date,home_team,away_team,team,scorer,minute,own_goal,penalty",
  "2022-11-30,Tunisia,France,Tunisia,Wahbi Khazri,58,FALSE,FALSE", "2019-06-24,Tunisia,Angola,Tunisia,Youssef Msakni,34,FALSE,TRUE",
  "2019-06-24,Tunisia,Angola,Angola,Djalma,72,FALSE,FALSE", "2018-06-28,Panama,Tunisia,Tunisia,Yassine Meriah,33,TRUE,FALSE",
  "2016-01-01,Tunisia,X,Tunisia,Wahbi Khazri,10,FALSE,FALSE"].join("\n");
const wd = (qid: string, nameEn: string, aliases: string[] = []) => ({ qid, nameEn, nameFr: null, aliases }) as unknown as WdPlayer;
describe("goalscorers", () => {
  it("counts Tunisia's goals per scorer, without own goals", () => expect(tunisiaScorers(csv)).toEqual([["wahbi khazri", 2], ["youssef msakni", 1]]));
  it("gives a floor only to the one footballer who answers to the name", () =>
    expect(Object.fromEntries(goalsFloors(tunisiaScorers(csv), [wd("Q27794", "Wahbi Khazri"), wd("Q2409513", "Youssef Msakni"), wd("Q9", "Other", ["Youssef Msakni"])]))).toEqual({ Q27794: 2 }));
});
```

### Step C: `src/pipeline/confidence.test.ts` (rows of `data-confidence-sheet.csv`; today 2026-10-04)

```ts
import { describe, expect, it } from "vitest";
import { capForSkipped, capsCeiling, rateCount, rateDated, rateUndated, type Rating, type Vote } from "./confidence.ts";
import type { Match, SourceId } from "./types.ts";
const today = "2026-10-04";
const v = <T>(source: SourceId, value: T, asOf: string | null = null): Vote<T> => ({ source, value, asOf });
const same = (a: string | null, b: string | null) => a === b;
type Case<T> = [name: string, votes: Vote<T>[], chosen: number, expected: Partial<Rating>, floor?: number];
const counts: Case<number>[] = [
  ["high: Wahbi Khazri caps, en 74 undated, fr 74 (2025-07-01), Wikidata 74", [v("enwiki", 74), v("frwiki", 74, "2025-07-01"), v("wikidata", 74)], 1, { confidence: "high", agreeing: ["enwiki", "frwiki", "wikidata"] }],
  ["medium: Ferjani Sassi caps, fr 104 (2026-09-28) over older, lower en 101 and Wikidata 94", [v("enwiki", 101, "2026-01-03"), v("frwiki", 104, "2026-09-28"), v("wikidata", 94)], 1, { confidence: "medium", agreeing: ["frwiki"] }],
  ["low: Aymen Abdennour caps, fr 57 alone and over 12 months old", [v("enwiki", 53, "2023-01-08"), v("frwiki", 57, "2024-09-19")], 1, { confidence: "low", agreeing: ["frwiki"], confidenceNote: "one source, as of 2024-09-19" }],
  ["low, newer but lower: Yassine Meriah caps, fr 93 (2026-09-27) under en 95 undated", [v("enwiki", 95), v("frwiki", 93, "2026-09-27")], 1, { confidence: "low", confidenceNote: "enwiki 95 (undated) is higher" }],
  ["low, newer but lower: Elias Achouri goals, fr 4 (2026-09-28) under en 5 (2026-06-26)", [v("enwiki", 5, "2026-06-26"), v("frwiki", 4, "2026-09-28")], 1, { confidence: "low" }],
  ["the floor never confirms: Youssef Msakni goals 23, martj42 floor 12", [v("enwiki", 23), v("frwiki", 23, "2026-07-26")], 1, { confidence: "high", agreeing: ["enwiki", "frwiki"] }, 12],
  ["low under the floor: Msakni's row with goals edited to 11 (the sheet has no real case)", [v("enwiki", 11), v("frwiki", 11, "2026-07-26")], 1, { confidence: "low", confidenceNote: "martj42 lists 12 goals by him" }, 12],
];
const clubs: Case<string | null>[] = [
  ["high: Mouez Hassen, en and fr Red Star; Wikidata's stale Cercle Brugge ignored", [v("enwiki", "Red Star", "2024-10-02"), v("frwiki", "Red Star", "2026-01-06"), v("wikidata", "Cercle Brugge")], 1, { confidence: "high" }],
  ["medium: Mohamed Ali Ben Romdhane, fr Al-Shamal (2026-09-28), en Al Ahly 146 days older", [v("enwiki", "Al Ahly", "2026-05-05"), v("frwiki", "Al-Shamal", "2026-09-28"), v("wikidata", "Ferencváros")], 1, { confidence: "medium", agreeing: ["frwiki"] }],
  ["low: Firas Chaouat, fr Al Ahly Benghazi (2026-09-11), en no club 44 days earlier", [v("enwiki", null, "2026-07-29"), v("frwiki", "Al Ahly Benghazi", "2026-09-11")], 1, { confidence: "low" }],
  ["low: Naïm Sliti, en Al Ahli (2026-04-27) chosen while the newer fr names no club", [v("enwiki", "Al Ahli", "2026-04-27"), v("frwiki", null, "2026-08-03"), v("wikidata", "Al Ahli")], 0, { confidence: "low", confidenceNote: "frwiki none (2026-08-03) is newer" }],
];
const undated: Case<string>[] = [
  ["high: Aymen Abdennour born 1989-08-06 in Wikidata, en and fr", [v("wikidata", "1989-08-06"), v("enwiki", "1989-08-06"), v("frwiki", "1989-08-06")], 0, { confidence: "high" }],
  ["low: a birth date from Wikidata alone (every one without Step 6.0)", [v("wikidata", "1989-08-06")], 0, { confidence: "low", agreeing: ["wikidata"], confidenceNote: "one source" }],
  ["low: Yassine Meriah's line, Wikidata midfielder chosen (D-S1-7) against en and fr defender", [v("wikidata", "midfielder"), v("enwiki", "defender"), v("frwiki", "defender")], 0, { confidence: "low" }],
  ["medium: Wahbi Khazri's line if the majority were chosen (en, fr midfielder; Wikidata forward)", [v("wikidata", "forward"), v("enwiki", "midfielder"), v("frwiki", "midfielder")], 1, { confidence: "medium", agreeing: ["enwiki", "frwiki"] }],
];
describe("P26 levels on real rows", () => {
  it.each(counts)("caps/goals %s", (_, votes, i, expected, floor) => expect(rateCount({ chosen: votes[i], votes, today, floor })).toMatchObject(expected));
  it.each(clubs)("club %s", (_, votes, i, expected) => expect(rateDated({ chosen: votes[i], votes, today, same })).toMatchObject(expected));
  it.each(undated)("undated %s", (_, votes, i, expected) => expect(rateUndated({ chosen: votes[i], votes })).toMatchObject(expected));
});
describe("ceiling and skipped rows", () => {
  const match = (date: string): Match => ({ date, home: "Tunisia", away: "X", homeScore: 1, awayScore: 0, tournament: "Friendly" });
  it("counts the matches in the national years, and gives up when the file does not cover them", () => {
    const matches = ["2014-05-01", "2015-03-01", "2016-06-01", "2026-06-25"].map(match);
    expect([capsCeiling(matches, 2015, 2016, null), capsCeiling(matches, 2015, null, "2026-09-27"), capsCeiling(matches, 2010, 2016, null)]).toEqual([2, null, null]);
    expect(rateCount({ chosen: v("enwiki", 3, "2017-01-01"), votes: [], today, ceiling: 2 }).confidence).toBe("low");
  });
  it("keeps high only with two sources that skipped nothing", () => {
    const high: Rating = { confidence: "high", agreeing: ["enwiki", "frwiki"] };
    expect(capForSkipped(high, ["frwiki"]).confidence).toBe("medium");
    expect(capForSkipped({ ...high, agreeing: ["enwiki", "frwiki", "wikidata"] }, ["frwiki"]).confidence).toBe("high");
    expect(capForSkipped(high, [])).toBe(high);
  });
});
```

(`toMatchObject` on the Khazri and Msakni-floor cases also checks `agreeing` excludes martj42; the exact `confidenceNote` strings are checked where they matter.)

Run: `pnpm test src/pipeline/confidence.test.ts src/pipeline/goalscorers.test.ts` — expected PASS (17 + 2 tests).

### Step D: `merge.ts`

1. Import `{ capsCeiling, NATIONAL_FIELD, rateFields, titleName }` and `type { Chosen, Evidence, Vote }` from `./confidence.ts`.
2. `MergeContext` gains `/** Tunisia goals per footballer from martj42, a floor (Task 8). */ goalsFloor?: Map<string, number>;`.
3. After `prov.caps = provenance(capsPick.chosen.source, …)` add `prov.goals = { ...prov.caps };`. Replace `prov.caps = fromOverride(capsOverride);` with `if (o.caps || o.capsAsOf) prov.caps = fromOverride((o.caps ?? o.capsAsOf)!); if (o.goals) prov.goals = fromOverride(o.goals);` (deliberate: a goals-only override no longer marks caps as decided by Jalel).
4. Just before `return {`:

```ts
  const boxes = [en, fr].filter((b): b is Infobox => b !== null);
  const lineOf = (b: Infobox) => (b.positionText ? lineFromLabel(firstPosition(b.positionText)) : null);
  const ids = (qids: (string | undefined)[]) => [...new Set(qids.filter((q): q is string => q !== undefined))].sort();
  const some = <T>(source: SourceId, value: T | null | undefined, asOf: string | null = null): Vote<T>[] => (value === null || value === undefined ? [] : [{ source, value, asOf }]);
  const openClubs = memberships.filter((m) => !m.national && m.end === null && !m.endUnknown);
  const clubSpells = memberships.filter((m) => !m.national);
  const tunisia = memberships.find((m) => m.teamQid === TUNISIA_TEAM && m.start !== null);
  const wdLine = p.positions.map((label) => lineFromLabel(label)).find((l) => l !== null) ?? null;
  const evidence: Evidence = {
    caps: candidates.map((c) => ({ source: c.source, value: c.caps, asOf: c.asOf })),
    goals: candidates.map((c) => ({ source: c.source, value: c.goals, asOf: c.asOf })),
    goalsFloor: ctx.goalsFloor?.get(p.qid) ?? null,
    capsCeiling: tunisia ? capsCeiling(ctx.tunisiaMatches, tunisia.start, tunisia.end, capsAsOf) : null,
    // An infobox naming no club votes "none"; a club title that does not resolve is no vote.
    clubId: [...boxes.flatMap((b): Vote<string | null>[] => (b.currentClub === null ? [{ source: sourceOf(b), value: null, asOf: b.clubsAsOf }] : some(sourceOf(b), ctx.index.resolve(b.lang, b.currentClub)?.qid, b.clubsAsOf))),
      ...(openClubs.length === 1 ? some<string | null>("wikidata", openClubs[0].teamQid) : [])],
    history: [...boxes.filter((b) => b.spells.length > 0).map((b) => ({ source: sourceOf(b), value: ids(b.spells.map((s) => ctx.index.resolve(b.lang, s.clubTitle)?.qid)), asOf: b.clubsAsOf })),
      ...(clubSpells.length > 0 ? some("wikidata", ids(clubSpells.map((m) => ctx.index.byQid.get(m.teamQid)?.qid))) : [])],
    birthDate: [...some("wikidata", p.birthDate), ...some("enwiki", en?.birthDate), ...some("frwiki", fr?.birthDate)],
    position: [...some("wikidata", wdLine), ...(en ? some("enwiki", lineOf(en)) : []), ...(fr ? some("frwiki", lineOf(fr)) : [])],
    nameLatin: [...some("wikidata", nameLatin), ...some("enwiki", p.titles.en && titleName(p.titles.en)), ...some("frwiki", p.titles.fr && titleName(p.titles.fr))],
    skipped: { national: boxes.filter((b) => b.skipped.some((r) => NATIONAL_FIELD.test(r.field))).map(sourceOf),
      career: boxes.filter((b) => b.skipped.some((r) => !NATIONAL_FIELD.test(r.field))).map(sourceOf) },
  };
  for (const b of boxes) for (const row of b.skipped) flags.push({ kind: NATIONAL_FIELD.test(row.field) ? "caps-row-skipped" : "career-row-skipped", detail: `${sourceOf(b)} ${row.field} (${row.reason}): ${row.raw}` });
  const chosen: Chosen = { caps, goals, clubQid: club.club?.qid ?? null, history: ids(history.spells.map((s) => s.club?.qid)), birthDate: p.birthDate,
    position: position.line, positionDetailLine: position.detail ? lineFromLabel(position.detail) : null, nameLatin };
  const rated = rateFields(prov, chosen, evidence, ctx.today);
  flags.push(...rated.flags);
```

and the returned draft uses `provenance: rated.provenance`. (`p.titles.en && …` gives `null` or a string; `some` drops `null`.)

### Step E: `merge.test.ts`

- `box()` defaults gain `skipped: []` (required once Task 4's fix lands).
- "builds a draft…": expected provenance keys gain `"goals"`; add

```ts
    const prov = merged!.draft.provenance;
    expect(prov.caps).toMatchObject({ confidence: "medium", agreeing: ["enwiki"] }); // en 90 fresh; Wikidata 80 older and lower
    expect(prov.position).toMatchObject({ confidence: "low", agreeing: ["wikidata"] }); // Wikidata midfielder, en Centre-back
    expect([prov.clubId?.confidence, prov.birthDate?.confidence, prov.governorate?.confidence]).toEqual(["medium", "low", "low"]);
    expect(Object.values(prov).every((e) => e.confidence !== undefined && (e.agreeing?.length ?? 0) > 0)).toBe(true);
```

  (The caps ceiling stays null here: the test's three matches start in September 2026, after the 2015 national start.)
- "applies caps overrides together…": add `expect(merged?.draft.provenance.caps).toMatchObject({ confidence: "high", agreeing: ["override"] });` and `expect(merged?.draft.provenance.goals?.source).toBe("enwiki");`.
- Add the floor through the merge, and the three skipped-row tests of §8:

```ts
  it("rates goals low and flags them when the infobox is under the martj42 floor", () => {
    const merged = mergePlayer(wdPlayer(), { ...context(), goalsFloor: new Map([["Q19956607", 4]]) }); // infobox 3 goals
    expect([merged?.draft.provenance.goals?.confidence, merged?.flags.some((f) => f.kind === "goals-below-floor")]).toEqual(["low", true]);
  });
```

Expected: `pnpm test src/pipeline` PASS (3 override + 25 merge tests, plus the new files). Commit with Task 6 (or separately as `feat: rate every merged field high, medium or low`).

## 4. Task 7 delta

**`pool.ts`** `FIELDS`: add `goals: (p) => p.goals,` and make caps `caps: (p) => [p.caps, p.capsAsOf],`.

**`validate.ts`**: import `confidences` and `type Confidence`; in the player loop, after the pools check:

```ts
    for (const [field, e] of Object.entries(p.provenance ?? {})) {
      if (!confidences.includes(e.confidence as Confidence)) errors.push(`${at}: ${field} has no confidence`);
      else if (!Array.isArray(e.agreeing) || e.agreeing.length === 0) errors.push(`${at}: ${field} names no agreeing source`);
    }
```

Test in `validate.test.ts`:

```ts
  it("requires a confidence and its sources on every provenance entry (P26)", () => {
    const base = { source: "frwiki" as const, retrievedAt: "2026-10-04" };
    const rated = { ...player, provenance: { caps: { ...base, confidence: "medium" as const, agreeing: ["frwiki" as const] } } };
    expect(validatePool({ ...pool, players: [rated] }, governorates)).toEqual([]);
    const bare = { ...player, provenance: { caps: base, clubId: { ...base, confidence: "high" as const, agreeing: [] } } };
    expect(validatePool({ ...pool, players: [bare] }, governorates)).toEqual(["player ali-maaloul: caps has no confidence", "player ali-maaloul: clubId names no agreeing source"]);
  });
```

**`report.ts`**: add

```ts
import { CROSS_CHECKED, SINGLE_SOURCE } from "./confidence.ts";
import type { ProvenancedField } from "./types.ts";
export const SKIP_KINDS = ["caps-row-skipped", "career-row-skipped"];
export type ConfidenceRow = { field: ProvenancedField; high: number; medium: number; low: number; none: number };
export const computeConfidence = (players: PoolPlayer[]): ConfidenceRow[] => [...CROSS_CHECKED, ...SINGLE_SOURCE].map((field) => {
  const row: ConfidenceRow = { field, high: 0, medium: 0, low: 0, none: 0 };
  for (const p of players) row[p.provenance[field]?.confidence ?? "none"]++;
  return row;
});
const VALUE: Record<ProvenancedField, (p: PoolPlayer) => string> = {
  caps: (p) => `${p.caps}${p.capsAsOf ? ` (as of ${p.capsAsOf})` : ""}`, goals: (p) => String(p.goals), clubId: (p) => p.clubId ?? "none",
  birthDate: (p) => p.birthDate, position: (p) => p.position, positionDetail: (p) => p.positionDetail ?? "", history: (p) => `${p.history.length} spells`,
  nameLatin: (p) => p.nameLatin, governorate: (p) => p.governorate ?? "", birthPlace: (p) => p.birthPlace ?? "", nameArabic: (p) => p.nameArabic ?? "",
  photo: (p) => p.photo?.file ?? "",
};
export type LowField = { id: string; field: ProvenancedField; value: string; note: string };
/** Low fields that two sources could have confirmed, in field order, then by id. */
export const lowFields = (players: PoolPlayer[]): LowField[] => CROSS_CHECKED.flatMap((field) => players.filter((p) => p.provenance[field]?.confidence === "low")
  .map((p) => ({ id: p.id, field, value: VALUE[field](p), note: p.provenance[field]?.confidenceNote ?? "" })));
// renderReport: at the top
  const low = lowFields(pool.players);
  const skipped = pool.flags.filter((f) => SKIP_KINDS.includes(f.kind));
// … between the summary line and "## Club changes":
    "", `## Low confidence, review first (${low.length})`, "",
    ...(low.length === 0 ? ["None."] : low.slice(0, 150).map((l) => `- ${l.id}: ${l.field} ${l.value}: ${l.note}`)),
    ...(low.length > 150 ? [`- … ${low.length - 150} more on /admin/pool?confidence=low`] : []),
    "", `Single-source fields stay low until Jalel confirms them: ${SINGLE_SOURCE.map((f) => `${f} ${pool.players.filter((p) => p.provenance[f]?.confidence === "low").length}`).join(", ")}.`,
    "", `### Rows the infobox parsers skipped (${skipped.length})`, "",
    ...(skipped.length === 0 ? ["None."] : skipped.slice(0, 100).map((f) => `- ${byQid.get(f.subject) ?? f.subject} (${f.subject}): ${f.detail}`)),
// … after the Coverage table:
    "", "## Confidence", "", "| Field | High | Medium | Low | None |", "| --- | --- | --- | --- | --- |",
    ...computeConfidence(pool.players).map((r) => `| ${r.field} | ${r.high} | ${r.medium} | ${r.low} | ${r.none} |`),
```

(Skipped-row flags also stay under `## Flags`; the first list is the one to read.)

Tests in `report.test.ts` (import `computeConfidence`):

```ts
describe("confidence in the report (P26)", () => {
  const rated = (confidence: "high" | "medium" | "low", confidenceNote?: string) => ({ source: "frwiki" as const, retrievedAt: "2026-10-04", confidence, agreeing: ["frwiki" as const], confidenceNote });
  const meriah = player("yassine-meriah", { caps: 93, capsAsOf: "2026-09-27", provenance: { caps: rated("low", "enwiki 95 (undated) is higher"), governorate: rated("low", "one source") } });
  const sassi = player("ferjani-sassi", { provenance: { caps: rated("medium"), governorate: rated("low", "one source") } });
  it("counts each field per level", () => {
    expect(computeConfidence([meriah, sassi]).find((r) => r.field === "caps")).toEqual({ field: "caps", high: 0, medium: 1, low: 1, none: 0 });
  });
  it("lists low cross-checked fields and skipped rows before the club changes", () => {
    const p = pool([meriah, sassi]);
    p.flags.push({ subject: "Q1", kind: "caps-row-skipped", detail: "frwiki sélection nationale (years): 2010-11 {{TUN football}}" });
    const report = renderReport({ pool: p, diff: diffPools(null, p), statuses: {}, today: "2026-10-04" });
    expect(report).toContain("## Low confidence, review first (1)");
    expect(report).toContain("- yassine-meriah: caps 93 (as of 2026-09-27): enwiki 95 (undated) is higher");
    expect(report).toContain("governorate 2");
    expect(report).toContain("### Rows the infobox parsers skipped (1)");
    expect(report).toContain("| caps | 0 | 1 | 1 | 0 |");
    expect(report.indexOf("## Low confidence")).toBeLessThan(report.indexOf("## Club changes"));
  });
});
```

Expected: PASS (4 validate, 7 report, …); the existing report test still passes (`toContain` only).

## 5. Task 8 delta

`run.ts`: import `{ GOALSCORERS_URL, goalsFloors, tunisiaScorers } from "./goalscorers.ts"`, add the line below after the `matches` line, and pass `goalsFloor: goalsFloors(scorers, players),` to `buildPool` (it flows through `BuildInput`, which extends `MergeContext`). A failed download only loses the floor check; the report shows the source as cached or failed. `run.test.ts`: the GitHub stub answers by URL, and the first test checks a rating.

```ts
  const scorers = (await cached<[string, number][]>("martj42-goals", async () => tunisiaScorers(await deps.github.getText(GOALSCORERS_URL)))) ?? []; // run.ts
const goalsCsv = "date,home_team,away_team,team,scorer,minute,own_goal,penalty\n2026-09-09,Tunisia,Mali,Tunisia,Test Footballer,12,FALSE,FALSE\n";
const github: PoliteClient = { getJson: async () => ({}), getText: async (url) => (url.includes("goalscorers") ? goalsCsv : csv) };
// in "builds and writes…":
expect(pool.players[0].provenance.caps).toMatchObject({ source: "enwiki", confidence: "medium", agreeing: ["enwiki"] });
```

(One fresh infobox as of 1 October 2026; floor 1 under 2 goals; no ceiling because the CSV starts in 2026.) Step 5's expected output gains `martj42-goals` `fresh` in the report and one more GitHub download (3.26 MB measured by the research).

`data/README.md`: the martj42 bullet becomes "**martj42/international_results**: Tunisia's results and goalscorers, to tell when caps are out of date and to catch impossible caps or goals. CC0. The scorer list covers about a third of Tunisia's goals, so it is only a lower bound." Add a section `## Confidence` with this text: "Every field in `pool.json` carries `confidence` (high, medium or low), `agreeing` (the sources that give the chosen value) and a short `confidenceNote` (decision P26). High: two sources agree and none newer says otherwise. Medium: one source under 12 months old, or older sources whose lower numbers their dates explain. Low: one undated or old source, or a conflict. An override is always high. The governorate, birthplace, Arabic name and photo have one source, so they stay low until an override confirms them. The report lists low fields first." `README.md`'s Data paragraph gains: "Every field records which sources agree on it; doubtful fields are reviewed first."

## 6. Task 9 delta

**No schema change, no migration.** `provenance` is already `jsonb` (`prisma/schema.prisma`, `Player.provenance`), and `syncPool` writes `p.provenance` whole, so `confidence`, `agreeing` and `confidenceNote` reach Postgres inside it. `docs/schema.md`'s Task 9 sentence gains: "Each provenance entry also holds `confidence` (high, medium or low), `agreeing` and `confidenceNote` (decision P26)."

`sync.db.test.ts`: give `maaloul.provenance.clubId` `confidence: "high", agreeing: ["enwiki", "frwiki"]` (the round-trip assertion then proves the keys survive), and add the P27 query, as data for Sprint 2:

```ts
import { ANSWER_READY_SQL, CHKOUN_FIELDS } from "./confidence.ts";
import type { Confidence, Provenance } from "./types.ts";
  it("lists active footballers with no low field a Chkoun? puzzle shows (P27, for Sprint 2)", async () => {
    const rated = (confidence: Confidence): Provenance => ({ source: "enwiki", retrievedAt: "2026-10-04", confidence, agreeing: ["enwiki"] });
    const sure: PoolPlayer = { ...maaloul, provenance: { clubId: rated("high"), caps: rated("medium"), governorate: rated("high"), nameArabic: rated("low") } };
    const doubtful: PoolPlayer = { ...sure, id: "doubtful", wikidataId: "Q1", provenance: { ...sure.provenance, caps: rated("low") } };
    const abroad: PoolPlayer = { ...sure, id: "abroad", wikidataId: "Q2", governorate: null, birthCountry: "FR", provenance: { clubId: rated("high"), birthPlace: rated("low") } };
    await syncPool(sql, pool([sure, doubtful, abroad]), governorates);
    const { rows } = await client.query(ANSWER_READY_SQL, [CHKOUN_FIELDS]);
    expect(rows.map((r) => r.id)).toEqual(["ali-maaloul"]);
  });
```

Expected: `pnpm test:db` PASS with one more test. Nothing uses the query in Sprint 1. A missing entry counts as not low (open point 4).

## 7. Task 10 delta

`src/app/admin/pool/page.tsx` imports `Link` from `next/link`, `CROSS_CHECKED` from `@/pipeline/confidence.ts`, `SKIP_KINDS` from `@/pipeline/report.ts`, `confidences` from `@/pipeline/types.ts`, and the types `Confidence`, `Provenance`, `ProvenancedField`. Helpers:

```tsx
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
/** The lowest level among the given fields; null when none is rated. */
const lowest = (p: PoolPlayer, fields: readonly ProvenancedField[]) =>
  fields.map((f) => p.provenance[f]?.confidence).filter((c): c is Confidence => c !== undefined).sort((a, b) => RANK[a] - RANK[b])[0] ?? null;
const confidenceList = (p: PoolPlayer) => (Object.entries(p.provenance) as [ProvenancedField, Provenance][]).filter(([, e]) => e.confidence)
  .sort(([a, x], [b, y]) => RANK[x.confidence!] - RANK[y.confidence!] || a.localeCompare(b))
  .map(([field, e]) => `${field} ${e.confidence} [${(e.agreeing ?? []).join(", ")}]`).join(" · ");
// Page (Next 16: searchParams is a Promise; read the page guide in node_modules/next/dist/docs/ first):
export default async function PoolReviewPage({ searchParams }: PageProps<"/admin/pool">) {
  const query = await searchParams;
  const wanted = typeof query.confidence === "string" && (confidences as readonly string[]).includes(query.confidence) ? (query.confidence as Confidence) : null;
  const field = typeof query.field === "string" && (CROSS_CHECKED as readonly string[]).includes(query.field) ? (query.field as ProvenancedField) : null;
  const pool = await loadPool();
  const shown = wanted ? pool.players.filter((p) => lowest(p, field ? [field] : CROSS_CHECKED) === wanted) : pool.players;
  const skippedBy = new Map<string, Flag[]>();
  for (const f of pool.flags) if (SKIP_KINDS.includes(f.kind)) skippedBy.set(f.subject, [...(skippedBy.get(f.subject) ?? []), f]);
  // … the existing constants …
// Before the Footballers table:
      <nav aria-label="Confidence filter" className="text-sm">
        Show: <Link href="/admin/pool">All</Link> · <Link href="/admin/pool?confidence=low">Low only</Link> · <Link href="/admin/pool?confidence=medium">Medium at worst</Link> · <Link href="/admin/pool?confidence=high">High only</Link>
        <br />Low by field: {CROSS_CHECKED.map((f, i) => (<span key={f}>{i > 0 ? " · " : ""}<Link href={`/admin/pool?confidence=low&field=${f}`}>{f}</Link></span>))}
        <p className="mt-1 text-chalk-dim">Showing {shown.length} of {pool.players.length} footballers{wanted ? `, lowest checked field ${wanted}` : ""}{field ? ` (${field})` : ""}. Checked fields: {CROSS_CHECKED.join(", ")}. The governorate, birthplace, Arabic name and photo have one source and stay low until confirmed.</p>
      </nav>
// The Sources cell of each row:
              <td className={cell}>
                {sources(p)}
                {skippedBy.has(p.wikidataId) && (<details className="mt-1"><summary className="cursor-pointer">Skipped rows ({skippedBy.get(p.wikidataId)!.length})</summary>
                  <ul className="ms-6 list-disc">{skippedBy.get(p.wikidataId)!.map((f, i) => (<li key={i}>{f.detail}</li>))}</ul></details>)}
              </td>
```

The table maps `shown` instead of `pool.players`; headers become `["Footballer", "Position", "Club", "Caps / goals", "Born", "Pools", "Confidence", "Sources"]`, and each row gains `<td className={cell}>{confidenceList(p)}</td>` before Sources. Server-rendered links only: no client component, no state library. English, outside `messages/`.

Browser test in `e2e/admin.spec.ts`:

```ts
test("the confidence filter keeps footballers whose checked fields include a low one", async ({ page }) => {
  await page.setExtraHTTPHeaders({ Authorization: basic(E2E_ENV.ADMIN_PASSWORD) });
  await page.goto("/admin/pool");
  const rows = page.getByRole("table", { name: "Footballers" }).locator("tbody tr");
  const all = await rows.count();
  await page.getByRole("navigation", { name: "Confidence filter" }).getByRole("link", { name: "Low only" }).click();
  await expect(page).toHaveURL(/\/admin\/pool\?confidence=low$/);
  const low = await rows.count();
  expect(low).toBeLessThanOrEqual(all);
  for (const text of await rows.locator("td:nth-child(7)").allInnerTexts()) expect(text).toMatch(/\b(caps|goals|clubId|birthDate|position|positionDetail|history|nameLatin) low\b/);
  await expect(page.getByText(`Showing ${low} of ${all} footballers, lowest checked field low`)).toBeVisible();
  await page.goto("/admin/pool?confidence=nonsense");
  expect(await rows.count()).toBe(all);
});
```

Expected: `admin.spec.ts` has 4 tests (3 + 1). It reads the committed `data/pool.json`, so it holds whatever the counts are.

## 8. Skipped rows (added after Task 4's review)

Given by Task 4's fix round: `Infobox.skipped: SkippedRow[]`, `SkippedRow = { field: string; raw: string; reason: "years" | "no-club" | "no-wrapper" | "limit" }`, empty when nothing was skipped.

- **Rule.** A row skipped in a national-team field (`NATIONAL_FIELD = /nationalteam|sélection nationale/i`) taints that infobox for `caps` and `goals`; a row skipped in any other field (`clubs`, `parcours pro`, `parcours senior`) taints it for `clubId` and `history`. A tainted source still votes, but `capForSkipped` keeps **high** only if two untainted sources agree, otherwise **medium**; medium and low are unchanged. So it is never high on that infobox's word.
- **Flags.** One per skipped row: `caps-row-skipped` (national field) or `career-row-skipped` (career field), detail `"<source> <field> (<reason>): <raw>"`; the names follow the existing pattern (`caps-maybe-stale`, `club-staff-role`). Code: §3 Step A (`capForSkipped`, `NATIONAL_FIELD`), Step D (`evidence.skipped`, the flag loop).
- **Report and page.** Carried in `pool.flags` (subject = Wikidata id), so `PoolPlayer` and `pool.json` keep their shape. The report's "Rows the infobox parsers skipped" list sits inside the low-confidence-first section (§4); each admin row shows its own "Skipped rows" (§7). Both filter on `SKIP_KINDS`.
- **Task 6 tests** (in `merge.test.ts`):

```ts
describe("skipped infobox rows (Task 4 review)", () => {
  const twoBoxes = (en: Partial<Infobox>, fr: Partial<Infobox>): MergeContext => ({
    today, memberships: new Map(), index, photos: new Map(), tunisiaMatches: [], overrides: { players: {}, clubTitles: {} }, governorateIds,
    infoboxes: { en: new Map([["Yassine Meriah", box("en", en)]]), fr: new Map([["Yassine Meriah (football)", box("fr", fr)]]) } });
  const caps = { caps: 90, goals: 3, capsAsOf: "2026-08-01" };
  const skip = (field: string) => [{ field, raw: "| 2010-11 | {{TUN football}} | 3 (0)", reason: "years" as const }];
  it("caps and goals drop from high to medium when one infobox skipped a national-team row, with a flag", () => {
    expect(mergePlayer(wdPlayer(), twoBoxes(caps, caps))?.draft.provenance.caps?.confidence).toBe("high");
    const merged = mergePlayer(wdPlayer(), twoBoxes(caps, { ...caps, skipped: skip("sélection nationale") }));
    expect([merged?.draft.provenance.caps?.confidence, merged?.draft.provenance.goals?.confidence]).toEqual(["medium", "medium"]);
    expect(merged?.flags).toContainEqual({ kind: "caps-row-skipped", detail: "frwiki sélection nationale (years): | 2010-11 | {{TUN football}} | 3 (0)" });
  });
  it("the current club drops from high to medium when one infobox skipped a career row, with a flag", () => {
    const en = { currentClub: "Espérance Sportive de Tunis", clubsAsOf: "2026-08-01" };
    const fr = { currentClub: "Espérance sportive de Tunis", clubsAsOf: "2026-08-01" };
    expect(mergePlayer(wdPlayer(), twoBoxes(en, fr))?.draft.provenance.clubId?.confidence).toBe("high");
    const merged = mergePlayer(wdPlayer(), twoBoxes({ ...en, skipped: skip("clubs") }, fr));
    expect([merged?.draft.provenance.clubId?.confidence, merged?.flags.some((f) => f.kind === "career-row-skipped")]).toEqual(["medium", true]);
  });
  it("a skipped row in one kind of field leaves the other kind alone", () =>
    expect(mergePlayer(wdPlayer(), twoBoxes({ ...caps, skipped: skip("clubs") }, caps))?.draft.provenance.caps?.confidence).toBe("high"));
});
```

(Both infoboxes resolve the club to `Q2`: English by `titleEn`, French by `titleFr` in the shared `index`. Same-date caps from en and fr agree, so `pickCaps` raises no flag.)

## 9. Recommendation for the controller: `MODULE_TYPELESS_PACKAGE_JSON`

The first CLI run by `check.sh` is **Task 7 step 5** (`pnpm data:check`), not Task 8, so the fix belongs in Task 7 (or a `chore:` commit before it).

| Option | Effect | Risks in this repo |
| --- | --- | --- |
| **(a) `src/pipeline/package.json` = `{ "type": "module" }`** | Node treats `src/pipeline/**` as ESM: no detection, no warning, no reparse. Nothing else changes scope. | Next 16/Turbopack compiles `.ts` as ESM either way, and the admin page's `@/pipeline/*.ts` imports carry extensions. Vitest (Vite) ignores `type` for `.ts`. `eslint.config.mjs`, `prisma.config.ts`, `playwright.config.ts`, `next.config.ts` are outside the folder. No `pnpm-workspace.yaml`, so pnpm sees no package. `pg` resolves from the root `node_modules`. |
| (b) root `"type": "module"` | Same for the pipeline | Every root config and `e2e/*.ts` changes loading mode: Playwright would load specs and its config as ESM (Task 10 adds an extensionless `./src/db/local-url` import there); Prisma and Next config loading change too. Wide blast radius for one warning; unverified. |
| (c) `.mts` entry files | Only the entry is ESM | Imported `.ts` files are still typeless, so the warning stays; the ESLint `src/pipeline/**/*.ts` rule and `*.test.ts` globs miss `.mts`. Does not solve it. |

**Recommendation: (a).** Create `src/pipeline/package.json` containing exactly `{ "type": "module" }`. Proof, from the repo root:

```bash
node -e "import('./src/pipeline/results.ts').then((m) => console.log(typeof m.tunisiaMatches))" 2>&1
pnpm data:check 2>&1 | grep -c MODULE_TYPELESS_PACKAGE_JSON
bash check.sh
```

Expected: `function` and no `MODULE_TYPELESS_PACKAGE_JSON` line; `0`; `all checks passed` (lint, format, typecheck, unit, database, build, browser, Lighthouse unchanged). Commit `chore: mark the pipeline folder as ES modules for Node`. Not verified: whether Node 24.16 still prints a type-stripping notice (the plan already allows one line).

## 10. What this costs

| Task | Extra work | Extra tests |
| --- | --- | --- |
| 6 | Step 6.0 (birth dates, recommended); two pure modules (~230 lines); ~45 lines in `mergePlayer` | 1 infobox, 17 confidence, 2 goalscorers, 1 merge + 3 skipped-row |
| 7 | ~50 lines in pool, validate, report; the §9 package file | 1 validate, 2 report |
| 8 | one cached source, README text | 1 assertion; one more download a night |
| 9 | one doc sentence, one fixture edit; no migration | 1 database test |
| 10 | filter, column, skipped rows (~50 lines) | 1 browser test |

About half a day to a day of implementer time in all, close to the research's estimate for its Options 1 + 2 plus the floor and ceiling checks.

## 11. Open points

1. **Positions under D-S1-7.** Wikidata's line wins, so a line only Wikidata gives is low (about 9 of 30 sheet rows: Meriah, Khazri, Msakni, Kechrida…). Jalel may prefer the majority of Wikidata, en and fr; that would change `pickPosition`, not the rating. Until then these show up as low, which is what the review is for.
2. **Step 6.0** edits Task 4's parsers while Task 4's fix round is open; the controller may fold it into that round. Without it every birth date is low and P27 would block every answer.
3. **Caps ceiling** relies on Wikidata's start year for the Tunisia membership; a start year that is too late gives a false low with a `caps-above-ceiling` flag that says why. If it is noisy on the first real build, drop the `capsCeiling` line in Step D.
4. **The P27 query** treats a missing entry (no club provenance, unresolved governorate) as not low; Sprint 2 must also require the fields it shows to exist.
5. **"No club" has no provenance** in the plan (`pickClub` returns `provenance: null` when every infobox names none), so retired footballers have no `clubId` rating. Harmless for Chkoun? (the active pool needs a club); worth a look for 30–0.
6. **Goalscorer names** match by folded Latin name and aliases owned by one footballer only; spellings like "Saber Khelifa" give no floor without an alias. A floor can only lower a level, so a miss loses a check and never inflates one.
7. **Report length.** The low list stops at 150 lines; positions (point 1) and, without Step 6.0, birth dates may fill it on the first run. The admin filter shows the rest.
8. The thresholds (12 months, 90 days) are the research's proposal applied literally to P26; changing one changes the counts.
