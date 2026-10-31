# Kora mobile polish implementation plan: the games on a phone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Draft for Jalel, 31 October 2026.** Built on the design reassessment `.superpowers/research/design-reassessment-2026-10-31.md` and its three research notes (`research-competitors.md`, `research-mobile-ux.md`, `research-tunisia.md`). Jalel approved on 31 October 2026, through the question tool: M1, M2, M3, M4; M5 as "six narrow columns, icon + short value, 14 px minimum, header row once, 3 by 2 under 340 px, after a screenshot mock he approves"; M6; M7 as "play yesterday's Chkoun?, yesterday only, from a link on the result, no streak effect"; M8 as "first letter after the 5th guess, the share text marks a hinted win"; the minors of §2.12. M9 to M11 are later sprints. Nothing here was run: no build, no test. Next.js references point at `node_modules/next/dist/docs/` (Next 16.3.8). Build on branch `mobile-polish` from `main` f871655.

**Goal:** On a 360×800 Android phone, both games start on the first screen under a one-line header; a first visit explains Chkoun? in a modal with one example row; the record is one tap away at any time; guesses grow towards the thumb; the tiles read as one row per guess at 360 to 412 px; the hub says what is left to play today; a visitor who finished today can play yesterday's footballer; a stuck visitor gets the first letter after the 5th guess. Three locales, 320 px still works, axe clean, Lighthouse budgets unchanged.

**Architecture:**
- One server component `GameHeader` (`src/components/game-header.tsx`) for Chkoun? and 30–0: back arrow, the game's name as the `h1`, a "?" and a stats button (one small client component), and a language menu built on `<details>` (no client code, T-MP-1). The full switcher moves to the foot of each game page and the hub.
- Dialogs are native `<dialog>` opened with `showModal()` (T-MP-2): the browser makes the rest of the page inert, keeps focus inside and closes on Escape. One client component `Dialog` (`src/components/dialog.tsx`) wraps it; the header's buttons ask for a dialog with a window event (`kora:open`, T-MP-3), so the header stays server-rendered and the game island stays a separate chunk.
- Chkoun? keeps its server rules (the answer never reaches the browser before the end). Yesterday's game (T7) goes through the same guess endpoint with yesterday's number and a token signed by a separate key; it writes nothing to Redis and never touches the record. The hint (T8) is in the guess answer from the 5th guess on, and only then.
- Every new rule that can live in `src/engine/chkoun/` does (the distribution bars, the share marks, the hint letter): pure, relative `.ts` imports, `node file.ts` runnable.
- The hub reads today's state from the device only (no request): a small client component per card, its line reserved in the server HTML so nothing moves (CLS).

**Tech Stack:** Next.js 16.3.8 (App Router, route handlers), next-intl 4.14.9, `@upstash/redis` 1.39.0 (faked by `FakeKv`), Vitest 5 + `fast-check` 3.23.2, Playwright 1.63 + `@axe-core/playwright`, Lighthouse CI 0.15.1. No new dependency.

**Done for the round means:** on `/ar`, `/tn`, `/fr` the Chkoun? search sits within the first 60% of a 360×800 screen, the help modal opens once and reopens from "?", the stats dialog opens at any time with the distribution chart, rows sit above a pinned input, the six-column row matches Jalel's approved mock, the hub cards show today's state, `/chkoun/yesterday` plays yesterday's footballer without touching the streak, the 5th guess brings the first letter, both share texts carry their marks; `bash check.sh` passes; Jalel has the screenshots at 320, 360, 375 and 412 px, the DRAFT list and the decision rows.

> **Approved by Jalel on 31 October 2026** through the question tool: the round (M1 to M8), the six-column tile row as mocked (Derja club nicknames on /ar, acronyms on /tn and /fr, icon-only headers with the word for screen readers), and every recommendation of the "Open for Jalel" list, recorded by Task 9 as P58 and T-MP-1 to T-MP-8. The nightly pipeline fix (the English infobox club) runs first, on its own branch.

## Global Constraints

From `CLAUDE.md` (verbatim where quoted):
- "**Jalel decides wording and architecture.** Propose with a recommendation, then wait. Record the outcome in `docs/decisions.md`." Every choice not listed as approved above is in **Open for Jalel**, with the plan's recommendation, and recorded as a T-MP reading he may overrule.
- "**Derja copy: drafted by Claude, corrected by Jalel** (since 6 October 2026, P51). Research the Tunisian form (Wikidata `aeb` labels, Tunisian usage); no machine translation, no Modern Standard Arabic where a Derja form exists; mark new strings DRAFT in `docs/strings-for-jalel.md` so he can skim and correct them after they ship."
- "**Western digits everywhere.** No letter-spacing or uppercase on translated text. Logical CSS properties only." (`inset-inline-*`, `inset-block-*`, `inline-size`, `ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`; never `left`/`right`/`pl`/`pr`/`ml`/`mr`.) The back arrow is the only mirrored icon (`rtl:-scale-x-100`).
- "**Vocabulary:** a player is a footballer; the person playing is a visitor."
- "**No secrets in the repo.**" No new secret: the past-token key derives from `CHKOUN_SEED` (T-MP-5). Tests use the fixed test seeds already in the test files.
- "**Free tiers only.** No ads, no prizes (Vercel Hobby terms)." No new dependency; no new Redis key (yesterday's game writes none).
- "Small conventional commits, one concern each. Tests accompany behaviour; database rules are tested against real Postgres, never mocks."
- "Cut features before cutting tests or docs. If something goes wrong mid-task, stop and re-plan."
- "This is NOT the Next.js you know": read the named guide in `node_modules/next/dist/docs/` before writing viewport, route, metadata or client-component code.

Carried from Sprints 2 and 3:
- Everything under `src/engine/` runs with `node file.ts`: relative imports ending in `.ts`, `import type` for types, no enums, no namespaces, no parameter properties, no import from outside `src/engine`.
- Redis is faked by `FakeKv` (`src/chkoun/kv.ts`), never the real Upstash. Tests never touch the network.
- One implementer at a time. Check free RAM before a build; stop under about 2 GB; build with `CIRCLE_NODE_TOTAL=2`. Never run checks with uncommitted changes in `data/pool.json`, `data/ids.json` or `data/report.md`.
- **Budgets unchanged** (`lighthouserc.json` is not edited): performance ≥ 0.9, accessibility = 1, CLS ≤ 0.1, script ≤ 250 KB, fonts ≤ 200 KB, total ≤ 500 KB on `/ar`, `/tn`, `/fr`, `/ar/chkoun`, `/ar/season`.
- **Phones:** 320 px still works (no sideways scroll, every tap target ≥ 44 px, inputs ≥ 16 px); the Facebook in-app browser in mind: no install or push prompt, every storage access wrapped, a lost storage only means the help modal shows again and the hub says "not yet".
- **Screenshots:** every task that changes something visible leaves PNGs under `.superpowers/sdd/2026-10-31-mobile-polish/screens/task-N/` named `<locale>-<width>-<state>.png` (360 px and 1280 px, `/ar`, `/tn`, `/fr`; T9 adds 320, 375 and 412), listed in the task report. `e2e/chkoun-helpers.ts` `shot()` takes the folder from a `ROUND` constant (T1 changes it from `2026-10-07-sprint-3`).
- **Shorthands:** **FAST** = `pnpm format && bash check-fast.sh` (expect `fast checks passed`). **COMMIT "msg" files** = FAST, then `git add <files> && git commit -m "msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. **E2E spec** = `NEXT_PUBLIC_POSTHOG_KEY= CIRCLE_NODE_TOTAL=2 pnpm build && pnpm test:e2e <spec>`. Pull request description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **DRAFT strings:** each task lists its new keys with the three drafts; T9 copies them to `docs/strings-for-jalel.md`. `src/i18n/messages.test.ts` fails on a key missing from a locale.

## File structure

New: `src/components/game-header.tsx`, `src/components/header-actions.tsx`, `src/components/language-menu.tsx`, `src/components/dialog.tsx`, `src/components/chkoun/help.tsx`, `src/components/chkoun/stats-dialog.tsx`, `src/components/season/help.tsx`, `src/components/hub-state.tsx`, `src/app/[locale]/chkoun/yesterday/page.tsx`, `src/engine/chkoun/hint.ts`, `src/chkoun/hub-state.ts`, `src/chkoun/help-seen.ts`, `e2e/game-header.spec.ts`, `e2e/chkoun-yesterday.spec.ts`. Everything else is a change to an existing file, listed per task.

---

### Task 1: The compact game header (M)

**Files:**
- Create: `src/components/game-header.tsx`, `src/components/header-actions.tsx`, `src/components/language-menu.tsx`, `e2e/game-header.spec.ts`
- Modify: `src/app/[locale]/chkoun/page.tsx`, `src/app/[locale]/season/page.tsx` (`PageHeader` and the `h1` block → `GameHeader`; the full `LanguageSwitcher` with `path={ROUTE}` at the end of the page, above the site footer), `src/components/language-switcher.tsx` (unchanged API; a `className` prop), `messages/{ar-TN,ar-Latn-TN,fr}.json` (`header.*`), `e2e/chkoun-helpers.ts` (`ROUND`), `e2e/hub.spec.ts` (the switcher test also runs on `/ar/chkoun`)
- Unchanged: `src/components/page-header.tsx` (Sources, privacy and the replay page keep it)

**Interfaces:**
- Produces: `GameHeader({ locale, path, name, strings: { home, language, help, stats }, actions }: { locale: Locale; path: string; name: string; strings: Record<"home" | "language" | "help" | "stats", string>; actions: boolean })`; `HeaderActions({ help, stats }: { help: string; stats: string })` ("use client": two 44×44 buttons, each `window.dispatchEvent(new CustomEvent("kora:open", { detail: "help" | "stats" }))`, `aria-haspopup="dialog"`); `LanguageMenu({ current, path, label }: { current: Locale; path: string; label: string })` (server: `<details>` whose `<summary>` reads `localeInfo[current].label` with `aria-label="{label}: {current label}"`, holding the three links of `LanguageSwitcher`, `inset-inline-end: 0` popover, no client code).
- Event contract (T-MP-3): `type OpenEvent = CustomEvent<"help" | "stats">` named `kora:open`; T2 and T3 listen to it.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (passing server children into a client component).
- [ ] **Step 2: Write the failing test** `e2e/game-header.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import arLatnTN from "../messages/ar-Latn-TN.json";
import arTN from "../messages/ar-TN.json";
import fr from "../messages/fr.json";
import { localeInfo, locales } from "../src/i18n/locales";
import { noSidewaysScroll, ready, skipHelp } from "./chkoun-helpers";
import { seedChkoun } from "./fixtures/chkoun";

const messages = { "ar-TN": arTN, "ar-Latn-TN": arLatnTN, fr };
test.beforeAll(async () => void (await seedChkoun()));
test.beforeEach(async ({ page }) => skipHelp(page));

for (const locale of locales) {
  const { prefix } = localeInfo[locale];
  const m = messages[locale];
  for (const [game, path] of [["chkoun", "/chkoun"], ["season", "/season"]] as const) {
    test(`${prefix}${path}: one header line, back, name, ?, stats, a small language menu`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`${prefix}${path}`);
      const header = page.locator("body > div header").first();
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(56);
      await expect(header.getByRole("link", { name: m.notFound.home })).toHaveAttribute("href", prefix);
      await expect(header.getByRole("heading", { level: 1 })).toHaveText(m.games[game].name);
      await expect(header.getByRole("button", { name: m.header.help })).toBeVisible();
      await expect(header.getByRole("button", { name: m.header.stats })).toBeVisible();
      await header.locator("summary").click();
      const other = locales.find((l) => l !== locale)!;
      await expect(header.getByRole("link", { name: localeInfo[other].label })).toHaveAttribute("href", `${localeInfo[other].prefix}${path}`);
      // The full switcher is still on the page, at its foot.
      await expect(page.getByRole("navigation", { name: m.hub.language })).toHaveCount(1);
      expect(await noSidewaysScroll(page)).toBe(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
  test(`${prefix}/chkoun: the search is in the first 60% of a 360×800 screen`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${prefix}/chkoun`);
    await ready(page);
    const box = (await page.getByRole("combobox").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(480);
  });
}
```
`skipHelp` is added to `e2e/chkoun-helpers.ts` now as a no-op (`export async function skipHelp(_page: Page) {}`) and filled in T2.
- [ ] **Step 3: Run** **E2E spec** `e2e/game-header.spec.ts`. Expected: FAIL (no `header.help` key, the header is two rows).
- [ ] **Step 4: Implement.** `GameHeader`: one `flex items-center gap-2 min-h-14` row: the back link (an inline SVG arrow, `aria-hidden`, `rtl:-scale-x-100`, the link's name `home` through `sr-only` text), the `h1` (`text-2xl font-extrabold`, `<bdi>`, `truncate`), then `ms-auto` `HeaderActions` and `LanguageMenu`. The pages lose the big `h1` and its `py-8` (`main` → `pt-2`). `LanguageMenu`'s popover is `absolute inset-inline-end-0 inset-block-start-full` inside a `relative` wrapper, links `min-h-11`. `noscript` stays in `main`. Strings (DRAFT, research: Tunisian "كيفاش", "سكّر"):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `header.help` | Comment jouer | كيفاش تلعب | Kifech tel3eb |
| `header.stats` | Tes stats | الأرقام متاعك | El ar9am mte3ek |
| `header.close` | Fermer | سكّر | Sakker |

- [ ] **Step 5: Run** **E2E spec** `e2e/game-header.spec.ts e2e/hub.spec.ts e2e/chkoun.spec.ts e2e/season.spec.ts`. Expected: PASS (the "with JavaScript off" test still finds `chkoun.rules`: T2 moves it). Screenshots: `<locale>-360-header.png`, `<locale>-360-language-open.png`, `<locale>-1280-header.png` for both games.
- [ ] **Step 6:** COMMIT `"feat(ui): one-line game header with help, stats and a small language menu (M1)"` with `src/components/game-header.tsx src/components/header-actions.tsx src/components/language-menu.tsx src/components/language-switcher.tsx "src/app/[locale]/chkoun/page.tsx" "src/app/[locale]/season/page.tsx" messages/ e2e/game-header.spec.ts e2e/chkoun-helpers.ts e2e/hub.spec.ts`.

### Task 2: How to play, once, then from "?" (M)

**Files:**
- Create: `src/components/dialog.tsx`, `src/components/chkoun/help.tsx`, `src/components/season/help.tsx`, `src/chkoun/help-seen.ts` (+ `help-seen.test.ts`)
- Modify: `src/app/[locale]/chkoun/page.tsx`, `src/app/[locale]/season/page.tsx` (the rules paragraph leaves `main`; it stays inside `<noscript>` with the noscript line; the help dialog is rendered by the page), `src/components/chkoun/tile-row.tsx` (exports `ExampleRow`), `src/app/globals.css` (`dialog::backdrop`, the open animation under `prefers-reduced-motion: no-preference` only), `messages/*.json` (`chkoun.help.*`, `season.help.*`), `e2e/chkoun-helpers.ts` (`skipHelp`), `e2e/chkoun.spec.ts` (the JavaScript-off test reads the rules from `<noscript>`), every e2e spec that opens a game page (`test.beforeEach(skipHelp)`)

**Interfaces:**
- Produces (`help-seen.ts`): `export const HELP_KEY = "kora.help.v1"`; `helpSeen(storage: StorageLike | null, game: "chkoun" | "season"): boolean`; `markHelpSeen(storage, game): void`; `shouldOpenHelp({ storage, game, inProgress }: { storage: StorageLike | null; game: "chkoun" | "season"; inProgress: boolean }): boolean` (false when seen, when the device holds a game of today, or when storage is refused and the modal already opened in this page view: a module flag).
- Produces (`dialog.tsx`, "use client"): `Dialog({ id, name, title, close, children, autoOpen }: { id: string; name: "help" | "stats"; title: string; close: string; children: ReactNode; autoOpen?: () => boolean })`: a `<dialog aria-labelledby>` opened by `showModal()` on a `kora:open` event whose detail is `name`, or on mount when `autoOpen()` is true; a close button that takes focus first; on close, focus returns to the element that opened it (the browser does this for `showModal`; the test pins it).
- Produces: `ChkounHelp({ strings, example })` (server: goal, the six columns in one sentence, one `ExampleRow`, the legend, the daily reset); `SeasonHelp({ strings })` (server: three short lines).

- [ ] **Step 1: Write the failing tests.** `src/chkoun/help-seen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HELP_KEY, helpSeen, markHelpSeen, shouldOpenHelp } from "./help-seen.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const refusing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };

describe("the first-visit help", () => {
  it("opens once per game, then never again on this device", () => {
    const s = memory();
    expect(shouldOpenHelp({ storage: s, game: "chkoun", inProgress: false })).toBe(true);
    markHelpSeen(s, "chkoun");
    expect(helpSeen(s, "chkoun")).toBe(true);
    expect(helpSeen(s, "season")).toBe(false);
    expect(JSON.parse(s.getItem(HELP_KEY)!)).toEqual({ chkoun: 1 });
  });
  it("does not open over a game already under way", () =>
    expect(shouldOpenHelp({ storage: memory(), game: "chkoun", inProgress: true })).toBe(false));
  it("with storage refused (in-app browsers) it opens at most once per page view", () => {
    expect(shouldOpenHelp({ storage: refusing, game: "season", inProgress: false })).toBe(true);
    markHelpSeen(refusing, "season");
    expect(shouldOpenHelp({ storage: refusing, game: "season", inProgress: false })).toBe(false);
  });
});
```
In `e2e/chkoun.spec.ts` (each locale, without `skipHelp`: a `test.describe` with its own context):

```ts
test(`${url}: the help opens on the first visit only, traps focus, closes on Escape, reopens from ?`, async ({ page }) => {
  await page.goto(url);
  const help = page.getByRole("dialog", { name: messages[locale].header.help });
  await expect(help).toBeVisible();
  await expect(help.locator("[data-example] li")).toHaveCount(6);
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  expect(await help.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(help).toBeHidden();
  const button = page.getByRole("button", { name: messages[locale].header.help });
  await button.click();
  await expect(help).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await help.getByRole("button", { name: messages[locale].header.close }).click();
  await expect(button).toBeFocused();
});
test(`${url}: the rules prose is no longer on the page`, async ({ page }) => {
  await skipHelp(page);
  await page.goto(url);
  await expect(page.locator("main").getByText(t.rules)).toBeHidden();
});
```
and `with reduced motion, the help appears without animation` (`reducedMotion: "reduce"`, `getComputedStyle(dialog).animationName === "none"`). The same first-visit test in `e2e/season.spec.ts` for `/season`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/chkoun/help-seen.test.ts`, then **E2E spec** `e2e/chkoun.spec.ts`. Expected: FAIL (module missing; no dialog).
- [ ] **Step 3: Implement.** `skipHelp(page)` = `page.addInitScript(() => localStorage.setItem("kora.help.v1", JSON.stringify({ chkoun: 1, season: 1 })))`; add `test.beforeEach(({ page }) => skipHelp(page))` to `chkoun.spec.ts`, `chkoun-share.spec.ts`, `chkoun-leak.spec.ts`, `season.spec.ts`, `season-share.spec.ts`, `game-header.spec.ts`, `share.spec.ts` (outside the first-visit tests). `ExampleRow` renders a fixed `TileRow` from the page's strings (club grey, country green, position green, age amber with ↑, caps grey with ↓, governorate unknown) with `data-example`, `aria-hidden` off (it is read as an example). The dialog: `max-inline-size: min(32rem, 100% - 2rem)`, `max-block-size: 85dvh`, scrolls inside. Strings (DRAFT):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `chkoun.help.goal` | Trouve le footballeur du jour en 8 essais. Seulement des joueurs en activité. | أعرف لاعب اليوم في 8 محاولات. كان اللاعبين اللي مازالو يلعبو. | A3ref la3eb el youm fi 8 mou7awlet. Ken el la3ba elli mazelou yel3bou. |
| `chkoun.help.tiles` | Chaque essai montre six cases : club, pays du club, poste, âge, sélections, lieu de naissance. | كل محاولة تورّيك 6 خانات: الفريق، بلاد الفريق، البلاصة، العمر، ماتشات المنتخب، وين تولد. | Kol mou7awla twarrik 6 khanet: el far9, blad el far9, el blasa, el 3omr, matchet el mountakhab, win tweled. |
| `chkoun.help.example` | Exemple : même pays de club et même poste ; la flèche dit que le joueur du jour est plus âgé. | مثال: نفس بلاد الفريق ونفس البلاصة؛ السهم يقلّك اللي لاعب اليوم أكبر. | Mithel: nafs blad el far9 w nafs el blasa; el ashem y9ollek elli la3eb el youm akber. |
| `chkoun.help.daily` | Un nouveau footballeur chaque jour à minuit, heure de Tunis. | كل نهار لاعب جديد مع نص الليل متاع تونس. | Kol nhar la3eb jdid m3a nos ellil mta3 Tounes. |
| `season.help.draft` | Pour chaque place, un club et une décennie sont tirés : choisis un joueur parmi cinq au plus. | لكل بلاصة يطلعلك فريق وعشرية: اختار لاعب من خمسة على الأكثر. | L kol blasa yetla3lek far9 w 3ochriya: ekhtar la3eb mel khamsa 3al akther. |
| `season.help.respin` | Tu peux relancer une seule fois. | تنجم تعاود الدورة مرة برك. | Tnajjem t3awed ed-dawra marra bark. |
| `season.help.play` | Avec 11 joueurs, joue 30 matchs : 30–0 est le rêve. | كي تكمّل 11 لاعب، العب 30 ماتش: 30–0 هو الحلم. | Ki tkammel 11 la3eb, el3ab 30 match: 30–0 howa el 7elm. |

`season.help.draft` reuses the existing `season.rules` wording; `season.rules` and `chkoun.rules` stay as keys (noscript).
- [ ] **Step 4: Run** `pnpm exec vitest run src/chkoun`, **E2E spec** `e2e/chkoun.spec.ts e2e/season.spec.ts e2e/chkoun-share.spec.ts`. Expected: PASS. Screenshots `<locale>-360-help.png`, `<locale>-1280-help.png` for both games.
- [ ] **Step 5: Run** `pnpm lighthouse` (the modal opens in Lighthouse's fresh profile). Expected: `/ar/chkoun` and `/ar/season` performance ≥ 0.9, CLS ≤ 0.1, accessibility 1. If LCP moves to the dialog and the score drops: open it after the first `requestIdleCallback` instead of on mount, and report it.
- [ ] **Step 6:** COMMIT `"feat(ui): how to play opens once and from ?, with one example row (M2)"` with the files above, then COMMIT `"test(e2e): game specs start with the help already seen"` with the e2e files only touched by `skipHelp`.

### Task 3: The record at any time, with the distribution (S)

**Files:**
- Create: `src/components/chkoun/stats-dialog.tsx`
- Modify: `src/engine/chkoun/stats.ts` (+ `stats.test.ts`), `src/components/chkoun/stats.tsx` (the chart under the four numbers), `src/components/chkoun/game.tsx` (publishes the record), `src/app/[locale]/chkoun/page.tsx` (renders `StatsDialog`), `src/components/season/island.tsx` and `src/components/season/hall.tsx` (30–0's stats button opens the hall in a `Dialog`), `messages/*.json`, `e2e/chkoun-share.spec.ts`, `e2e/season.spec.ts`

**Interfaces:**
- Produces (engine): `distribution(stats: Stats | null, today: number | null): { guesses: number; count: number; share: number; today: boolean }[]` — 8 bars, `share` = count / max count (0 when no win), `today` true on the bar of a win counted for the puzzle `stats.last` when `today === stats.last`.
- Produces: `StatsDialog({ strings })` ("use client"): listens to `kora:open` "stats"; shows the record from the last `kora:chkoun-stats` event (`CustomEvent<{ stats: Stats; store: "server" | "device"; n: number | null }>`, dispatched by the island whenever it sets the record) or, before any, `loadStats(deviceStorage())`; "no game yet" when null.

- [ ] **Step 1: Write the failing tests** in `src/engine/chkoun/stats.test.ts`:

```ts
import { distribution, nextStats } from "./stats.ts";
describe("distribution", () => {
  it("eight bars, scaled to the most frequent, today's win marked", () => {
    let s = nextStats(null, { n: 1, solved: true, guesses: 3 });
    s = nextStats(s, { n: 2, solved: true, guesses: 3 });
    s = nextStats(s, { n: 3, solved: true, guesses: 5 });
    const bars = distribution(s, 3);
    expect(bars).toHaveLength(8);
    expect(bars.map((b) => b.count)).toEqual([0, 0, 2, 0, 1, 0, 0, 0]);
    expect(bars[2].share).toBe(1);
    expect(bars[4]).toMatchObject({ share: 0.5, today: true });
    expect(bars.filter((b) => b.today)).toHaveLength(1);
  });
  it("a loss today marks nothing; no record gives eight empty bars", () => {
    const lost = nextStats(null, { n: 4, solved: false, guesses: 8 });
    expect(distribution(lost, 4).some((b) => b.today)).toBe(false);
    expect(distribution(null, null).every((b) => b.count === 0 && b.share === 0)).toBe(true);
  });
});
```
In `e2e/chkoun-share.spec.ts`: `the stats button opens the record before, during and after a game, with today's bar marked` (open before any guess: "no game yet"; win in 2; reopen: `[data-bar="2"][data-today]` visible, its sr text `fill(t.stats.bar, { n: 2, count: 1 })`; Escape closes). In `e2e/season.spec.ts`: `the stats button opens the hall of best seasons`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/engine/chkoun/stats.test.ts`. Expected: FAIL, `distribution` is not exported.
- [ ] **Step 3: Implement.** The chart is an `<ol>` of 8 rows: the number, a bar `inline-size: max(1.75rem, share × 100%)` with the count inside (`tabular-nums`), today's bar `bg-mint`, others `bg-pitch-700`; each row's text for screen readers is `stats.bar`. No chart library. Strings (DRAFT):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `chkoun.stats.distribution` | Victoires par nombre d'essais | الربحات حسب عدد المحاولات | Er-rab7at 7asb 3add el mou7awlet |
| `chkoun.stats.bar` | En {n} essais : {count} | في {n} محاولات: {count} | Fi {n} mou7awlet: {count} |
| `chkoun.stats.empty` | Pas encore de partie sur cet appareil. | مازلت ما لعبت حتى لعبة في التليفون هذا. | Mazelt ma l3abt 7atta le3ba fel telifoun hedha. |

- [ ] **Step 4: Run** `pnpm exec vitest run src/engine/chkoun`, **E2E spec** `e2e/chkoun-share.spec.ts e2e/season.spec.ts`. Expected: PASS. Screenshots `<locale>-360-stats-empty.png`, `<locale>-360-stats-won.png`, `<locale>-360-hall.png`.
- [ ] **Step 5:** COMMIT `"feat(engine): guess distribution bars (M3)"` with `src/engine/chkoun/stats.ts src/engine/chkoun/stats.test.ts`, then COMMIT `"feat(chkoun): the record opens from the header at any time (M3)"` with the rest.

### Task 4: Chkoun? grows towards the thumb, and the §2.12 minors (M)

**Files:**
- Modify: `src/components/chkoun/game.tsx` (order: notice slot, rows, then the search block; the newest row scrolled into view), `src/components/chkoun/shell.tsx` (same order, same boxes), `src/components/chkoun/search-box.tsx` (`placement: "above" | "below"` for the suggestion list), `src/app/[locale]/layout.tsx` (`viewport.interactiveWidget = "resizes-content"`), `src/app/globals.css` (`.tile-flip` 0.45 s → 0.3 s), `src/components/chkoun/tile-row.tsx` (delay 120 → 60 ms), `src/components/season/result.tsx` (the 30 matches: first 5, then a `<details>` "all 30"), `src/components/season/island.tsx` (a loading line in the reserved spin area until the first spin), `messages/*.json`, `e2e/chkoun.spec.ts`, `e2e/season.spec.ts`

**Interfaces:**
- Produces: `SearchBox` prop `placement: "above" | "below"` (default `"below"`): the listbox opens above the input when the search block is pinned; the arrow keys keep their meaning (Down moves to the next suggestion, the one closer to the input when above: the list is rendered in reverse order with `flex-col-reverse` so the DOM order and the reading order stay the same).
- Layout (T-MP-4): while playing, the search block is `sticky inset-block-end-0 bg-pitch-950 pb-[env(safe-area-inset-bottom)]`; with no row it sits under the header in the normal flow; rows (`<ol>`) come before it.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` (`interactiveWidget`).
- [ ] **Step 2: Write the failing tests** in `e2e/chkoun.spec.ts`:

```ts
for (const width of [320, 360]) {
  test(`${url}: at ${width} px rows sit above the search, the search stays on screen, the newest row is in view`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 5)) await guess(page, id);
    const search = (await page.getByRole("combobox").boundingBox())!;
    const rows = page.locator("[data-guess]");
    const last = (await rows.last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(search.y);
    expect(search.y + search.height).toBeLessThanOrEqual(740);
    expect(last.y).toBeGreaterThanOrEqual(0);
    await page.getByRole("combobox").fill("a");
    const list = (await page.getByRole("listbox").boundingBox())!;
    expect(list.y + list.height).toBeLessThanOrEqual(search.y + 1);
    expect(await noSidewaysScroll(page)).toBe(0);
  });
}
test(`${url}: the shell and the live game put the search at the same height`, async ({ page }) => {
  await page.route("**/api/chkoun/today", async (r) => { await new Promise((f) => setTimeout(f, 1500)); await r.continue(); });
  await page.goto(url);
  const shell = (await page.locator("#chkoun-shell-search").boundingBox())!;
  await ready(page);
  const live = (await page.getByRole("combobox").boundingBox())!;
  expect(Math.abs(live.y - shell.y)).toBeLessThanOrEqual(1);
});
```
In `e2e/season.spec.ts`: `the result shows 5 matches, then all 30 behind one button`; `the spin area says it is loading until the first spin`.
- [ ] **Step 3: Run** **E2E spec** `e2e/chkoun.spec.ts e2e/season.spec.ts`. Expected: FAIL (rows under the search).
- [ ] **Step 4: Implement.** After a guess, `requestAnimationFrame(() => newest.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }))`, where `reduced = matchMedia("(prefers-reduced-motion: reduce)").matches`. The countdown line moves under the search block (it scrolls with the page). Strings (DRAFT):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `season.result.allMatches` | Voir les 30 matchs | شوف الـ30 ماتش الكل | Chouf el 30 match el kol |
| `season.loading` | Le premier tirage arrive… | الدورة الأولى جاية… | Ed-dawra el oula jeya… |

- [ ] **Step 5: Run** **E2E spec** `e2e/chkoun.spec.ts e2e/season.spec.ts e2e/game-header.spec.ts`, then `pnpm lighthouse`. Expected: PASS; `/ar/chkoun` CLS ≤ 0.1. Screenshots `<locale>-360-two-rows.png`, `<locale>-360-five-rows-typing.png`, `<locale>-320-five-rows.png`, `<locale>-360-season-result.png`.
- [ ] **Step 6:** COMMIT `"feat(chkoun): rows above a pinned search, the newest in view (M4)"`, then COMMIT `"fix(ui): shorter tile flip, 30–0 loading line and 5 matches before the rest (§2.12)"` with the css, tile delay and season files.

### Task 5: The six-column tile row (M)

**Gate: wait for the approved mock.** This task starts only when Jalel has approved the screenshot mock (approved by him on 31 October in principle: "six narrow columns, icon + short value, 14 px minimum, header row once, 3 by 2 under 340 px, after a screenshot mock he approves"). If no mock exists yet, Step 1 makes it and the task stops there.

**Files:**
- Create (mock only, untracked): `.superpowers/mocks/tile-row.html`, its screenshots under `.superpowers/sdd/2026-10-31-mobile-polish/screens/task-5/mock-<locale>-<width>.png`
- Create: `data/curated/club-short.json` (the short club labels, DRAFT, `by: claude`)
- Modify: `src/chkoun/labels.ts` (+ `labels.test.ts`: `Labels.short: Record<string, string>`; `tileText` returns `{ text, short, label }`), `src/chkoun/page-data.server.ts`, `src/pipeline/check.ts` (+ `check.test.ts`: `validateClubShort`), `src/components/chkoun/tile-row.tsx` (`TileHeaders` with icons, shown once from 340 px; tiles show `short`, `title` and screen-reader text keep the full value), `messages/*.json` (`positions.short.*`), `e2e/chkoun.spec.ts` (the 320 px test keeps 3 by 2; new 360 and 412 tests)

**Interfaces:**
- Produces: `type ClubShortFile = { by: string; at: string; note: string; clubs: Record<string, { latin: string; arabic: string }> }`; `validateClubShort(json: unknown, clubIds: string[]): string[]` (every id a known club, both forms 1 to 8 characters, Western digits only); `tileText(column, tile, labels, strings): { text: string; short: string; label: string | null }` (club: `labels.short[id] ?? text`; position: `strings.positionsShort[line]`; country: the label when ≤ 8 characters, else the ISO code; age and caps: unchanged; governorate: the label, cut with an ellipsis by CSS).

- [ ] **Step 1: The mock.** A static HTML page (`.superpowers/mocks/tile-row.html`, inline CSS only, the site's fonts from `public/fonts`) showing three guess rows in each locale with the proposed six columns at 320, 360, 375 and 412 px: a header row of six icons (shield, globe, shirt, cake, cap, pin; inline SVG), the column word in `title` and screen-reader text only (a visible word would fall under 14 px); values at 14 px (`text-sm`), 15 px in Arabic script; 3 by 2 under 340 px with the column word above each value. Screenshot it with Playwright (`page.setContent`). Send the screenshots to the controller for Jalel with the three questions in **Open for Jalel** item 1; **stop**. Resume only on his answer; record it as D-MP-1 in `docs/decisions.md`.
- [ ] **Step 2: Write the failing tests.** `src/chkoun/labels.test.ts`:

```ts
it("a tile shows the short value; the full value stays in title and screen-reader text", () => {
  const labels = { clubs: { est: "Espérance Sportive de Tunis" }, short: { est: "EST" }, governorates: {}, countries: { SA: "Arabie saoudite", FR: "France" } };
  const t = (column: TileColumn, value: string | number | null) => tileText(column, { colour: "grey", arrow: null, value }, labels, strings);
  expect(t("club", "est")).toEqual({ text: "Espérance Sportive de Tunis", short: "EST", label: null });
  expect(t("club", "unknown-club").short).toBe("unknown-club");
  expect(t("country", "FR").short).toBe("France");
  expect(t("country", "SA").short).toBe("SA");
  expect(t("position", "midfielder").short).toBe(strings.positionsShort.midfielder);
});
```
`src/pipeline/check.test.ts`: `a club-short file names known clubs, 1 to 8 characters, both scripts` (`{ est: { latin: "EST", arabic: "الترجي" } }` passes; `{ x: … }` gives `club-short.json: x is not a club`; `{ est: { latin: "Espérance", arabic: "الترجي" } }` gives `club-short.json: est latin is longer than 8`). In `e2e/chkoun.spec.ts`:

```ts
for (const width of [360, 375, 412]) {
  test(`${url}: at ${width} px each guess is one row of six, values at 14 px or more`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url);
    await ready(page);
    for (const id of fixture.others.slice(0, 3)) await guess(page, id);
    const row = page.locator("[data-guess]").first();
    const ys = await row.locator("[data-column]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
    const sizes = await row.locator("[data-value]").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    await expect(page.locator("[data-tile-headers]")).toHaveCount(1);
    expect(await noSidewaysScroll(page)).toBe(0);
  });
}
```
- [ ] **Step 3: Run** `pnpm exec vitest run src/chkoun/labels.test.ts src/pipeline/check.test.ts`, **E2E spec** `e2e/chkoun.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** exactly the approved mock. Breakpoint `min-[340px]:grid-cols-6`; header row `data-tile-headers`, once, `aria-hidden` (each tile keeps its column in screen-reader text). `data/curated/club-short.json` DRAFT for the 16 Ligue 1 clubs and the foreign clubs of guessable footballers (Latin: the acronyms fans write, EST, ESS, CA, CSS, USM, ST, CAB, USBG, OB, ESZ, ESM, ASM, ESHS, CSHL, JSO, PSS; Arabic: الترجي، النجم، الإفريقي، الصفاقسي، المنستير، الملعب، البنزرتي، بن ڤردان، الباجي، جرجيس، المتلوي، المرسى، حمام سوسة، حمام الأنف، العمران، ساقية الدائر; the foreign ones from their Wikidata short names or none). Strings (DRAFT):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `positions.short.goalkeeper` | Gardien | حارس | 7ares |
| `positions.short.defender` | Déf. | دفاع | Dfe3 |
| `positions.short.midfielder` | Milieu | وسط | Wost |
| `positions.short.forward` | Att. | هجوم | Hjoum |

- [ ] **Step 5: Run** `pnpm data:check`, **E2E spec** `e2e/chkoun.spec.ts e2e/chkoun-share.spec.ts`. Expected: PASS (the 320 px "3 by 2, no word broken" test unchanged). Screenshots `<locale>-<320|360|375|412>-rows.png`, compared side by side with the mock in the task report.
- [ ] **Step 6:** COMMIT `"feat(data): short club labels for the tiles (DRAFT)"` with `data/curated/club-short.json src/pipeline/check.ts src/pipeline/check.test.ts`, then COMMIT `"feat(chkoun): six-column tile row from 340 px, as approved (M5, D-MP-1)"` with the rest.

### Task 6: The hub says what is left today (S)

**Files:**
- Create: `src/chkoun/hub-state.ts` (+ `hub-state.test.ts`), `src/components/hub-state.tsx`
- Modify: `src/app/[locale]/page.tsx` (header: brand at the start, `LanguageMenu` at the end; the hero `text-4xl sm:text-6xl`, `py-6`; the full switcher at the foot), `src/components/game-card.tsx` (a `state` slot with a reserved `min-h-12` line), `src/season/device.ts` (+ `device.test.ts`: `LAST_KEY`, `saveLast`, `loadLast`), `src/components/season/island.tsx` (calls `saveLast` with the season), `messages/*.json` (`hub.state.*`), `e2e/hub.spec.ts`

**Interfaces:**
- Produces (`hub-state.ts`, plain functions on a `StorageLike`): `type ChkounState = { n: number; kind: "notYet" | "playing" | "won" | "lost"; guesses: number; streak: number }`; `chkounState(storage: StorageLike | null, now: Date, first?: Day): ChkounState` (`n = puzzleNumber(tunisDay(now), first)`; reads `GAME_KEY` and `STATS_KEY` through `loadGame`/`loadStats`; the streak counts only when `stats.last >= n - 1`); `type SeasonState = { kind: "notYet" } | { kind: "played"; w: number; d: number; l: number }`; `seasonState(storage, now): SeasonState` (from `kora.season.v1.last` when its `day` is today in Tunis).
- Produces: `HubState({ game, strings })` ("use client"): renders nothing on the server and on the first client render (same HTML), then the line after mount (inside the reserved box: no layout shift).

- [ ] **Step 1: Write the failing tests** `src/chkoun/hub-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextStats } from "@/engine/chkoun/stats.ts";
import { GAME_KEY, STATS_KEY } from "./device.ts";
import { chkounState, seasonState } from "./hub-state.ts";

const first = "2026-10-05";
const noon = new Date("2026-10-31T11:00:00Z"); // puzzle 27
const store = (entries: Record<string, unknown>) => ({
  getItem: (k: string) => (k in entries ? JSON.stringify(entries[k]) : null),
  setItem: () => {},
});

describe("the hub's line for Chkoun?", () => {
  it("not yet, with today's number, when the device holds no game of today", () =>
    expect(chkounState(store({}), noon, first)).toEqual({ n: 27, kind: "notYet", guesses: 0, streak: 0 }));
  it("in progress with the guesses so far", () =>
    expect(chkounState(store({ [GAME_KEY]: { n: 27, token: "t", rows: [{}, {}], status: "playing", card: null } }), noon, first)).toMatchObject({ kind: "playing", guesses: 2 }));
  it("won, with the score and the streak", () => {
    const stats = nextStats(nextStats(null, { n: 26, solved: true, guesses: 4 }), { n: 27, solved: true, guesses: 3 });
    expect(chkounState(store({ [GAME_KEY]: { n: 27, token: "t", rows: [{}, {}, {}], status: "won", card: null }, [STATS_KEY]: stats }), noon, first)).toEqual({ n: 27, kind: "won", guesses: 3, streak: 2 });
  });
  it("yesterday's game is not today's; a streak older than yesterday is 0", () => {
    const old = nextStats(null, { n: 20, solved: true, guesses: 2 });
    expect(chkounState(store({ [GAME_KEY]: { n: 26, token: null, rows: [], status: "won", card: null }, [STATS_KEY]: old }), noon, first)).toEqual({ n: 27, kind: "notYet", guesses: 0, streak: 0 });
  });
  it("refused storage reads as not yet", () =>
    expect(chkounState(null, noon, first).kind).toBe("notYet"));
});
describe("the hub's line for 30–0", () => {
  it("played today shows the record; another day's season is not today's", () => {
    const last = { day: "2026-10-31", xi: "a_0", w: 21, d: 5, l: 4, points: 68, rating: 80, replaces: "x", at: "2026-10-31T10:00:00Z" };
    expect(seasonState(store({ "kora.season.v1.last": last }), noon)).toEqual({ kind: "played", w: 21, d: 5, l: 4 });
    expect(seasonState(store({ "kora.season.v1.last": { ...last, day: "2026-10-30" } }), noon)).toEqual({ kind: "notYet" });
  });
});
```
In `e2e/hub.spec.ts`: `the brand comes before the language menu` (DOM order and visual order in both directions); `a card says not yet, then won in 3 with the streak, after a game` (play Chkoun? to a win in 3, go back to the hub, the card shows `fill(t.hub.state.won, { n: 27, score: "3/8" })` and the streak); `the hub's cards fit the first screen at 360×800` (the second card's top ≤ 800); CLS ≤ 0.1 on `/ar` with a saved game (PerformanceObserver `layout-shift` sum).
- [ ] **Step 2: Run** `pnpm exec vitest run src/chkoun/hub-state.test.ts src/season/device.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Strings (DRAFT; the number is `#{n}`, Western digits):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `hub.state.notYet` | #{n} · pas encore joué | #{n} · مازلت ما لعبتش | #{n} · mazelt ma l3abtech |
| `hub.state.playing` | #{n} · en cours, {guesses}/8 | #{n} · مازلت تلعب، {guesses}/8 | #{n} · mazelt tel3eb, {guesses}/8 |
| `hub.state.won` | #{n} · trouvé en {score} | #{n} · لقيتو في {score} | #{n} · l9itou fi {score} |
| `hub.state.lost` | #{n} · raté, X/8 | #{n} · ما لقيتوش، X/8 | #{n} · ma l9itouch, X/8 |
| `hub.state.streak` | Série : {n} | السلسلة: {n} | Série: {n} |
| `hub.state.seasonNotYet` | Pas encore de saison aujourd'hui | مازلت ما لعبت حتى موسم اليوم | Mazelt ma l3abt 7atta mawsem el youm |
| `hub.state.seasonPlayed` | Aujourd'hui : {w}-{d}-{l} | اليوم: {w}-{d}-{l} | El youm: {w}-{d}-{l} |

The record `{w}-{d}-{l}` is wrapped in `<bdi dir="ltr">`.
- [ ] **Step 4: Run** `pnpm exec vitest run src/chkoun src/season`, **E2E spec** `e2e/hub.spec.ts`, `pnpm lighthouse`. Expected: PASS; `/ar`, `/tn`, `/fr` unchanged scores, script ≤ 250 KB. Screenshots `<locale>-360-hub-fresh.png`, `<locale>-360-hub-played.png`, `<locale>-1280-hub.png`.
- [ ] **Step 5:** COMMIT `"feat(season): keep the last season on the device for the hub"` with `src/season/device.ts src/season/device.test.ts src/components/season/island.tsx`, then COMMIT `"feat(hub): cards show today's state, smaller hero, brand first (M6)"` with the rest.

### Task 7: Play yesterday's footballer (L)

**Files:**
- Create: `src/app/[locale]/chkoun/yesterday/page.tsx`, `e2e/chkoun-yesterday.spec.ts`
- Modify: `src/chkoun/token.ts` (+ `token.test.ts`: `pastTokenKey`), `src/chkoun/guess.ts` (+ `guess.test.ts`), `src/chkoun/today.ts` (+ `today.test.ts`: `yesterday` in the answer), `src/chkoun/puzzle.server.ts` (+ `puzzle.db.test.ts`: `puzzleOn`), `src/app/api/chkoun/guess/route.ts` (passes `pastPuzzle`), `src/chkoun/device.ts` (+ `device.test.ts`: `PAST_KEY`, `loadPast`, `savePast`), `src/engine/chkoun/share.ts` (+ `share.test.ts`: `marks`), `src/components/chkoun/game.tsx` (`mode: "today" | "yesterday"`), `src/components/chkoun/result.tsx` (the link), `src/analytics/events.ts` (+ `events.test.ts`: `past`), `src/app/sitemap.ts` test unchanged (the page is not a game route), `e2e/fixtures/chkoun.ts` (yesterday's row), `messages/*.json`
- Unchanged: `src/app/admin/chkoun/page.tsx`, `src/chkoun/nightly.ts`, `src/chkoun/store.ts` (yesterday's play writes no `r:` or `s:` key, so the nightly copy and the admin counts see nothing new)

**Interfaces:**
- Produces: `pastTokenKey(seed: string): Buffer` = HMAC(seed, `"kora/chkoun/token/v1/past"`) (T-MP-5: a today token can never continue a past game, nor the other way, even across midnight).
- Changes: `GameDeps.pastPuzzle?: (day: Day) => Promise<Puzzle | null>`. `handleGuess` with `body.n === today's number − 1` (and ≥ 1) plays yesterday: token read and signed with `pastTokenKey`, `d` = yesterday; same rate limit; at the end the answer carries `card`, `store: "device"`, `past: true`, never `stats`, never a cookie, and nothing is written to Redis. Any other `n` keeps today's rules (`409 newDay`).
- Changes: `handleToday`'s open answer adds `yesterday: { number: n - 1, day }` when `n - 1 >= 1` (no extra read).
- Produces: `puzzleOn(day: Day): Promise<Puzzle | null>` in `puzzle.server.ts`: Redis `kora:{env}:chkoun:p:{day}` (kept 3 days), then the `puzzles` row; never draws or writes a reserve; null when the day has no row.
- Produces: `ShareInput.marks?: string[]` appended after the score on its line, each preceded by a space (`#26 · 4/8 · البارح`); the LRM wrapping covers the marks.
- Produces: `EventProps.past?: boolean` (`cleanProps` keeps a boolean only).
- Page: `/[locale]/chkoun/yesterday`, static, `index: false`, canonical to itself, not in the sitemap; the island in `mode="yesterday"` reads `body.yesterday` from `/api/chkoun/today`, keeps its game under `kora.chkoun.v1.past`, shows a "does not count" line, no stats button action beyond the record, and a link back to today.

- [ ] **Step 1: Write the failing tests.** `src/chkoun/guess.test.ts`:

```ts
import { addDays } from "@/engine/chkoun/day.ts";
import { pastTokenKey } from "./token.ts";

describe("yesterday's footballer (M7)", () => {
  const yesterday = addDays("2026-10-19", -1);
  const past = (over: Partial<GameDeps> = {}) =>
    deps({ pastPuzzle: async (day) => ({ day, number: n - 1, playerId: answer.id }), ...over });
  const postPast = (d: GameDeps, body: { token?: string | null; guess: string }) =>
    handleGuess(d, JSON.stringify({ n: n - 1, token: null, ...body }), { cookie: null, ip });

  it("a guess on yesterday's number gets a row and a past token for that day", async () => {
    const r = await postPast(past(), { guess: wrong[0] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ guesses: 1, status: "playing", store: "device", past: true });
    expect(leaks(r.body)).toEqual([]);
  });
  it("tokens do not cross: today's on yesterday's number, yesterday's on today's", async () => {
    const today = signToken({ n, d: "2026-10-19", g: [wrong[0]] }, tokenKey(seed));
    expect((await postPast(past(), { token: today, guess: wrong[1] })).status).toBe(403);
    const old = signToken({ n: n - 1, d: yesterday, g: [wrong[0]] }, pastTokenKey(seed));
    expect((await post(past(), { token: old, guess: wrong[1] })).status).toBe(403);
  });
  it("a finished past game gives the card and records nothing: no stats, no cookie, no result key", async () => {
    const out = await (async () => {
      let token: string | null = null;
      let last;
      for (const guess of [wrong[0], answer.id]) {
        last = await postPast(past({ kv }), { token, guess });
        token = last.body.token as string;
      }
      return last!;
    })();
    expect(out.body).toMatchObject({ status: "won", store: "device", past: true });
    expect(out.body.card).toMatchObject({ id: answer.id });
    expect(out.body.stats).toBeUndefined();
    expect(out.setCookie).toBeUndefined();
    expect([...kv.entries.keys()].filter((k) => /:chkoun:(r|s):/.test(k))).toEqual([]);
  });
  it("two days back, or before puzzle 1, is refused as a new day", async () => {
    expect((await handleGuess(past(), JSON.stringify({ n: n - 2, token: null, guess: wrong[0] }), { cookie: null, ip })).status).toBe(409);
    const early = deps({ now: new Date("2026-10-05T11:00:00Z"), pastPuzzle: async () => null });
    expect((await handleGuess(early, JSON.stringify({ n: 0, token: null, guess: wrong[0] }), { cookie: null, ip })).status).toBe(409);
  });
  it("no row for yesterday is closed (503), never a reserve", async () =>
    expect((await postPast(past({ pastPuzzle: async () => null }), { guess: wrong[0] })).status).toBe(503));
});
```
`src/chkoun/today.test.ts`: `an open day names yesterday's number and day; puzzle 1 names none`. `src/chkoun/puzzle.db.test.ts`: `puzzleOn reads a past day's row and writes no reserve for an empty day` (count of `puzzles` rows unchanged). `src/engine/chkoun/share.test.ts`:

```ts
it("marks follow the score on its line, inside the marks in Arabic script", () => {
  expect(shareText({ ...base, marks: ["البارح"] }).split("\n")[1]).toBe(`${M}#12 · 4/8 · البارح${M}`);
  expect(shareText({ ...base, locale: "fr", marks: ["hier"] }).split("\n")[1]).toBe("#12 · 4/8 · hier");
  expect(shareText({ ...base, marks: [] })).toBe(shareText(base));
});
```
`src/chkoun/device.test.ts`: `yesterday's game is kept apart from today's` (`savePast` then `loadGame(storage, n)` is null and `loadPast(storage, n - 1)` returns it). `src/analytics/events.test.ts`: `past is kept only as a boolean`. `e2e/chkoun-yesterday.spec.ts` (each locale): `after today's result, a link opens yesterday's footballer; a win there leaves the streak and today's game unchanged; the share says yesterday` (finish today, note the stats; follow the link; win in 2 against `fixture.yesterday`; stats dialog shows the same numbers; share text line 2 contains `t.share.yesterday`; back link returns to today's result); `the page is noindex and not in the sitemap`; `axe finds nothing on yesterday's playing and finished states`; `at 320 px no sideways scroll`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/chkoun src/engine/chkoun src/analytics` and `pnpm test:db`. Expected: FAIL (`pastTokenKey` missing, `past` absent).
- [ ] **Step 3: Implement** the server side first (token, guess, today, `puzzleOn`, route), run the unit and database tests (PASS), COMMIT `"feat(chkoun): the guess API plays yesterday's puzzle without touching the record (M7, T-MP-5)"`. Then `e2e/fixtures/chkoun.ts`: write a row for yesterday (an answer-ready footballer not among `answers`, returned as `fixture.yesterday`), the share marks, the device key, the page and the island mode. Strings (DRAFT; "البارح"/"lbare7" is the Tunisian "yesterday"):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `chkoun.yesterday.link` | Jouer le footballeur d'hier | العب لاعب البارح | El3ab la3eb lbare7 |
| `chkoun.yesterday.title` | Le footballeur d'hier | لاعب البارح | La3eb lbare7 |
| `chkoun.yesterday.note` | Pour le plaisir : ça ne compte pas dans ta série. | للمتعة برك: ما يتحسبش في السلسلة. | Lel mot3a bark: ma yet7sebch fel série. |
| `chkoun.yesterday.back` | Retour au footballeur du jour | ارجع للاعب اليوم | Arja3 l la3eb el youm |
| `chkoun.yesterday.closed` | Le footballeur d'hier n'est plus disponible. | لاعب البارح موش موجود توّا. | La3eb lbare7 mouch mawjoud tawa. |
| `chkoun.yesterday.meta.title` | Le footballeur d'hier · C'est qui ? · Kora | لاعب البارح · شكون؟ · Kora | La3eb lbare7 · Chkoun? · Kora |
| `chkoun.share.yesterday` | hier | البارح | lbare7 |

- [ ] **Step 4: Run** `pnpm exec vitest run`, **E2E spec** `e2e/chkoun-yesterday.spec.ts e2e/chkoun.spec.ts e2e/chkoun-share.spec.ts e2e/chkoun-api.spec.ts e2e/chkoun-leak.spec.ts e2e/admin-chkoun.spec.ts`. Expected: PASS (the admin spec unchanged). Screenshots `<locale>-360-result-link.png`, `<locale>-360-yesterday-playing.png`, `<locale>-360-yesterday-won.png`.
- [ ] **Step 5:** COMMIT `"feat(chkoun): play yesterday's footballer from the result (M7)"` with the page, island, result, device, share, events, fixture, messages and e2e files.

### Task 8: The first letter after the 5th guess (S)

**Files:**
- Create: `src/engine/chkoun/hint.ts` (+ `hint.test.ts`)
- Modify: `src/chkoun/guess.ts` (+ `guess.test.ts`), `src/chkoun/device.ts` (`SavedGame.hint?`), `src/components/chkoun/game.tsx` (the hint line above the search; `marks` for a hinted win), `src/analytics/events.ts` (+ `events.test.ts`: `hinted`), `messages/*.json`, `e2e/chkoun-share.spec.ts`

**Interfaces:**
- Produces (engine): `export const HINT_AFTER = 5`; `firstLetter(name: string | null): string | null` (the first letter of the trimmed name, as written: `[...name.trim()][0]`, Latin upper-cased with `toLocaleUpperCase("fr")`, null for null or empty); `hinted(solved: boolean, guesses: number): boolean` = solved and guesses > HINT_AFTER.
- Changes: a `playing` guess answer with `guesses.length >= HINT_AFTER` carries `hint: { latin: string; arabic: string | null; french: string | null }` (first letters of the answer's three name forms, from `footballers.card(answer.id)`); no answer before the 5th guess carries `hint`; the final answer carries none (the card says everything). The device keeps `hint` in `SavedGame`; the page shows `localName`'s form: Arabic on `/ar`, French on `/fr`, Latin on `/tn`.
- Share: a hinted win adds the mark `💡` (`marks: ["💡"]`, and `[label, "💡"]` for yesterday). `chkoun_finished` gains `hinted: boolean`. The record (streak, distribution) counts a hinted win like any win.

- [ ] **Step 1: Write the failing tests.** `src/engine/chkoun/hint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { firstLetter, hinted, HINT_AFTER } from "./hint.ts";

describe("the first-letter hint", () => {
  it("is the first letter as written, Latin in capitals", () => {
    expect(firstLetter("ellyes Skhiri")).toBe("E");
    expect(firstLetter("  إلياس السخيري")).toBe("إ");
    expect(firstLetter("Éric")).toBe("É");
    expect(firstLetter(null)).toBeNull();
    expect(firstLetter("  ")).toBeNull();
  });
  it("a win after the 5th guess is a hinted win", () => {
    expect(HINT_AFTER).toBe(5);
    expect([5, 6, 8].map((k) => hinted(true, k))).toEqual([false, true, true]);
    expect(hinted(false, 8)).toBe(false);
  });
});
```
`src/chkoun/guess.test.ts`:

```ts
it("the hint comes with the 5th guess and after, never before, never at the end", async () => {
  const out = await play(deps(), [...wrong.slice(0, 6), answer.id]);
  expect(out.slice(0, 4).every((r) => r.body.hint === undefined)).toBe(true);
  expect(out[4].body.hint).toEqual({ latin: "E", arabic: "إ", french: "E" });
  expect(out[5].body.hint).toEqual(out[4].body.hint);
  expect(out[6].body).toMatchObject({ status: "won" });
  expect(out[6].body.hint).toBeUndefined();
  expect(out.slice(0, 6).flatMap((r) => leaks(r.body))).toEqual([]);
});
it("a past game gets the same hint after its 5th guess", async () => {
  const d = deps({ pastPuzzle: async (day) => ({ day, number: n - 1, playerId: answer.id }) });
  let token: string | null = null;
  let last: Awaited<ReturnType<typeof handleGuess>> | undefined;
  for (const guess of wrong.slice(0, 5)) {
    last = await handleGuess(d, JSON.stringify({ n: n - 1, token, guess }), { cookie: null, ip });
    token = last.body.token as string;
  }
  expect(last!.body).toMatchObject({ past: true, hint: { latin: "E" } });
});
```
`e2e/chkoun-share.spec.ts`: `after five wrong guesses the first letter shows; a win then marks the share with 💡` (the hint line reads `fill(t.hint.label, { letter })` with the locale's letter; win on guess 6; share text line 2 ends with `💡`; a reload keeps the hint line).
- [ ] **Step 2: Run** `pnpm exec vitest run src/engine/chkoun/hint.test.ts src/chkoun/guess.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The hint line is `role="status"` so it is announced once; it sits in the pinned search block (T4), `min-h-6` reserved from the 5th guess on. Strings (DRAFT; "عاونة"/"3awna" is the Tunisian "a bit of help"):

| Key | fr | ar-TN | ar-Latn-TN |
| --- | --- | --- | --- |
| `chkoun.hint.label` | Un coup de pouce : son nom commence par {letter} | عاونة: اسمو يبدا بـ{letter} | 3awna: esmou yebda b {letter} |

- [ ] **Step 4: Run** `pnpm exec vitest run`, **E2E spec** `e2e/chkoun-share.spec.ts e2e/chkoun-leak.spec.ts`. Expected: PASS. Screenshots `<locale>-360-hint.png`, `<locale>-360-hinted-win.png`.
- [ ] **Step 5:** COMMIT `"feat(chkoun): first letter after the 5th guess, a hinted win marked in the share (M8)"` with the files above.

### Task 9: Full check, screenshots, strings, decisions, pull request (S)

**Files:**
- Modify: `docs/strings-for-jalel.md` (new section "Mobile polish (31 October 2026)"), `docs/decisions.md` (section "31 October 2026: mobile polish"), `docs/superpowers/specs/2026-10-03-kora-design.md` (§4 Chkoun?: the help modal, the hint, yesterday's page; §3 the hub's state line), `e2e/zz-shots.spec.ts` stays untracked (the controller's)
- Test: everything (`bash check.sh`)

- [ ] **Step 1: Run** `bash check.sh` (RAM check first; no uncommitted data files). Expected: all green; Lighthouse within the unchanged budgets on the five URLs.
- [ ] **Step 2: Screenshots** with a throwaway spec run from the scratchpad (not committed): `/ar`, `/tn`, `/fr`; hub fresh and played; Chkoun? first visit (help open), empty, three rows, five rows typing, hint, won with stats open, yesterday; 30–0 header, help, hall, result; at 320×640, 360×800, 375×667 and 412×915. Into `.superpowers/sdd/2026-10-31-mobile-polish/screens/task-9/<locale>-<width>-<state>.png`. Check by eye: nothing cut, no sideways scroll, the search within 60% of 360×800 on a fresh visit.
- [ ] **Step 3: Strings.** Copy every key of Tasks 1 to 8 into the new section in the file's table format (key, English gloss, French draft, `ar-TN` as shipped, `ar-Latn-TN` as shipped, status DRAFT), plus `data/curated/club-short.json` as a table, plus the open wording questions: عاونة vs مساعدة for the hint, عشرية in `season.help.draft`, the short position forms, "Comment jouer" vs "Règles". COMMIT `"docs: mobile polish strings for Jalel (all DRAFT, P51)"`.
- [ ] **Step 4: Decisions.** Append to `docs/decisions.md`:

| #  | Topic | Decision |
| --- | --- | --- |
| P58 | Mobile polish round | M1 to M8 and the §2.12 minors of the reassessment of 31 October 2026, as Jalel approved them that day through the question tool (M5: six narrow columns, icon + short value, 14 px minimum, header row once, 3 by 2 under 340 px, after a screenshot mock he approves; M7: yesterday only, from a link on the result, no streak effect; M8: first letter after the 5th guess, the share marks a hinted win). M9 to M11 are later sprints. Decided by Jalel on 31 October 2026 |
| D-MP-1 | The tile-row mock | (Jalel's answer to Task 5 Step 1, dated) |

and the technical readings, "taken by the mobile polish plan; Jalel may overrule any":

| # | Topic | Reading |
| --- | --- | --- |
| T-MP-1 | Language menu | A `<details>` with the three links in the game header and on the hub, no client code; the full switcher at the foot of each game page and the hub (the layout's footer cannot know the page) |
| T-MP-2 | Dialogs | Native `<dialog>` with `showModal()`: focus kept inside, Escape and inert page by the browser; the help's "seen" flag in `kora.help.v1` on the device; refused storage opens it at most once per page view; never over a game under way |
| T-MP-3 | Header to game | The header's buttons send a `kora:open` window event; the record dialog listens to `kora:chkoun-stats` from the island and falls back to the device's record |
| T-MP-4 | Pinned search | `position: sticky` at the block end while playing, suggestions above it, `interactiveWidget: "resizes-content"` so Android's keyboard shrinks the layout |
| T-MP-5 | Yesterday's game | Same guess endpoint with yesterday's number; tokens signed by a key derived for past games; nothing written to Redis, no cookie, no record; `puzzleOn` reads the row and never draws a reserve; page `/chkoun/yesterday`, noindex, outside the sitemap; kept on the device under `kora.chkoun.v1.past` |
| T-MP-6 | The hint | In the guess answer from the 5th guess on, all three name forms' first letters; "hinted" = a win after the 5th guess, so no token change; the record counts it as any win; `💡` on the share's score line |
| T-MP-7 | Hub state | Read from the device only, after mount, inside a reserved line; the puzzle number from the phone's clock; 30–0 from a new `kora.season.v1.last` |
| T-MP-8 | Short tile values | From `data/curated/club-short.json` (checked by `data:check`) and `positions.short.*`; the full value stays in `title` and the screen-reader text |

COMMIT `"docs: decisions for the mobile polish round (P58, T-MP-1 to T-MP-8)"` with `docs/decisions.md docs/superpowers/specs/2026-10-03-kora-design.md`.
- [ ] **Step 5: Pull request.** Push `mobile-polish`; `gh pr create --title "Mobile polish: the games on a phone (M1 to M8)"` with: what changed per M item; the screenshots grid (360 px, three locales); every DRAFT string still shipping; the readings to overrule; the phone checks for Jalel below; no file deletions. Body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Phone checks for Jalel (10 minutes, Android):** in Chrome and in the Facebook in-app browser (open a link sent in Messenger): the help opens once; the keyboard does not cover the search or the suggestions after five guesses; the language menu opens and closes; yesterday's game leaves the streak as it was; the share to WhatsApp shows `💡` and the yesterday word on the score line, in the right order in an Arabic bubble; closing and reopening the in-app browser keeps today's game (or, if storage was wiped, the hub says "not yet" and nothing breaks).

## Free-tier arithmetic [E]

| Resource | Change | Effect |
| --- | --- | --- |
| Upstash commands | yesterday's guesses: the rate limit only (2 commands a guess, as today's), no result or record write; the puzzle read: 1 GET per instance and day, cached in memory | at 100 yesterday games a day of 5 guesses: about 30,000 a month, under 7% of the 500,000 |
| Vercel invocations | one guess call per yesterday guess | about 15,000 a month at that rate, of 1,000,000 |
| Neon | `puzzleOn` reads yesterday's row once per instance and day when Redis is cold | negligible |
| Script | `HeaderActions`, `Dialog`, `StatsDialog`, `HubState`: a few KB; the game island unchanged in size apart from the hint and the mode | checked by Lighthouse in T2, T4, T6 and T9 |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The first-visit modal becomes the LCP element in Lighthouse's fresh profile | T2 Step 5 measures; fallback: open after the first idle callback |
| Android's keyboard covers the pinned search in some WebViews (Facebook) | `interactiveWidget: "resizes-content"` plus `scrollIntoView` on focus; Jalel's phone check; fallback: unpin while the keyboard is open (`visualViewport` resize) |
| Short club labels read wrong to fans | DRAFT in a curated file Jalel corrects; the full name stays in `title` and for screen readers |
| Yesterday's tokens confused with today's at midnight | Separate key (T-MP-5); a 409 at the turn of the day sends the page to "closed" with the link to today |
| The hint leaks more than the letter | Only first letters, from the 5th guess; `leaks()` runs on every answer before the end |
| Storage wiped in the in-app browser | Every read wrapped; the help shows again, the hub says "not yet"; no error |
| T5 waits on the mock | T6 to T8 do not depend on T5; if the mock is not approved when T8 is done, T9 runs without T5 and T5 ships in its own pull request |

## Open for Jalel

1. **The tile-row mock (T5, gate).** Approve or correct the screenshots, and three choices in it: (a) club short labels: Latin acronyms (EST, ESS, CA, CSS) on `/tn` and `/fr`, the Derja nickname (الترجي، النجم، الإفريقي، الصفاقسي) on `/ar` (recommended), or acronyms everywhere; (b) the club country: its name when it fits in 8 characters, else the ISO code (recommended), or always the code; (c) the column header: icons only with the word for screen readers (recommended), or icon and a 12 px word (below your 14 px minimum).
2. **Which first letter (T8):** the first letter of the name as the search lists it, usually the given name (recommended: what the visitor types first), or of the family name.
3. **30–0's two buttons (T1 to T3):** "?" opens three short lines on the draft, the re-spin and the season; the stats button opens the hall of best seasons on this device (recommended; 30–0 has no streak), or 30–0 shows only "?".
4. **The legend (T2):** in the help modal and still under the game (recommended), or in the modal only.
5. **Yesterday's address (T7):** `/ar/chkoun/yesterday`, `/tn/chkoun/yesterday`, `/fr/chkoun/yesterday`, an English slug like `/chkoun` and `/season` (recommended), or a query `?day=yesterday` on the game page.
6. **The share marks (T7, T8):** the word for yesterday and `💡` after the score on the second line (`#26 · 5/8 · البارح · 💡`) (recommended: the header line stays the game's name), or on a line of their own.
7. **The hub line for 30–0 (T6):** today's last season (`اليوم: 21-5-4`) (recommended), or today's best.
8. **The full language switcher's place (T-MP-1):** at the foot of each game page and the hub, above the site footer (recommended), or inside the site footer on every page (needs the page path in the layout: a client hook, more script).
9. **Readings T-MP-1 to T-MP-8** in `docs/decisions.md` (T9): overrule any, especially T-MP-5 (no server record of yesterday's games, so the admin page shows none) and T-MP-6 (the hint arrives by itself after the 5th guess, not on a tap).
10. **Derja corrections:** every new string above (DRAFT, T9 list) and the short club labels.

## Coverage check

| Approved item | Tasks |
| --- | --- |
| M1 compact header, small language menu, full switcher kept | 1 (T-MP-1) |
| M2 how to play once, "?" reopens, one example row, rules prose gone | 2 (T-MP-2) |
| M3 record at any time, distribution chart | 3 (T-MP-3) |
| M4 rows above, pinned input, newest row in view, 320 px | 4 (T-MP-4) |
| M5 six columns after the approved mock | 5 (D-MP-1, T-MP-8) |
| M6 hub state, smaller hero, brand first | 6 (T-MP-7) |
| M7 yesterday only, from the result link, no streak effect, marked share | 7 (T-MP-5) |
| M8 first letter after the 5th guess, hinted win marked | 8 (T-MP-6) |
| §2.12 minors: flip, 30 matches, 30–0 loading line | 4 |
| Budgets, axe, 320 px, Facebook in-app browser, DRAFT strings, decisions, PR | every task; 9 |
