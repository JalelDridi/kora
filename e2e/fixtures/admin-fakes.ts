import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { E2E_ENV } from "../../playwright.config";
import type { FakeCommit, FakeState } from "../../src/admin/github/fake.ts";
import type { FakeSearch } from "../../src/admin/wikidata-search.ts";

// The GitHub fake the server under test uses (KORA_ADMIN_FAKES): main holds
// the working tree's data/overrides.json and curated files, with no commit
// yet. The spec reads the state back to see what a save committed.

const FILE = E2E_ENV.KORA_ADMIN_FAKES;

const claim = (id: string) => ({
  mainsnak: { datavalue: { value: { id } } },
});
const born = (time: string) => ({
  mainsnak: { datavalue: { value: { time, precision: 11 } } },
});

/** A footballer the Tunisia selection misses: no P27 or P1532 Tunisia. */
export const OUTSIDE = { qid: "Q999001", label: "Hamza Msakni (test)" };
/** In the committed pool (data/pool.json). */
export const IN_POOL = { qid: "Q2409513", label: "Youssef Msakni" };

/**
 * The Wikidata fake's answers (src/admin/wikidata-search.ts): "Msakni"
 * finds a footballer outside the selection and one in the pool; "Zzz"
 * finds nothing.
 */
const SEARCH: FakeSearch = {
  results: {
    Msakni: [
      {
        id: OUTSIDE.qid,
        label: OUTSIDE.label,
        description: "footballer (test fixture)",
      },
      {
        id: IN_POOL.qid,
        label: IN_POOL.label,
        description: "Tunisian footballer",
      },
    ],
    Zzz: [],
  },
  entities: {
    [OUTSIDE.qid]: {
      id: OUTSIDE.qid,
      claims: {
        P106: [claim("Q937857")],
        P27: [claim("Q142")],
        P569: [born("+2003-04-05T00:00:00Z")],
      },
      sitelinks: {},
    },
    [IN_POOL.qid]: {
      id: IN_POOL.qid,
      claims: {
        P106: [claim("Q937857")],
        P27: [claim("Q948")],
        P569: [born("+1990-10-28T00:00:00Z")],
      },
      sitelinks: { enwiki: { title: "Youssef Msakni" } },
    },
  },
};

export function resetFakes(): void {
  const files: Record<string, string> = {
    "data/overrides.json": readFileSync("data/overrides.json", "utf8"),
  };
  for (const name of readdirSync("data/curated").filter((n) =>
    n.endsWith(".json"),
  ))
    files[`data/curated/${name}`] = readFileSync(
      `data/curated/${name}`,
      "utf8",
    );
  const state: FakeState = {
    files,
    commits: [],
    runs: [],
    jobs: {},
    logs: {},
    pull: null,
    search: SEARCH,
  };
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

const state = () => JSON.parse(readFileSync(FILE, "utf8")) as FakeState;

/** The fake's commits, newest first. */
export const fakeCommits = (): FakeCommit[] => state().commits;

/** A file's text on the fake's main. */
export function fakeFile(file: string): string {
  const text = state().files[file];
  if (text === undefined) throw new Error(`no ${file} in the fake`);
  return text;
}

/** Sets one footballer's entry in the fake's data/overrides.json on main. */
export function setOverride(qid: string, entry: unknown): void {
  const current = state();
  const json = JSON.parse(current.files["data/overrides.json"]!) as {
    players: Record<string, unknown>;
  };
  json.players[qid] = entry;
  current.files["data/overrides.json"] = `${JSON.stringify(json, null, 2)}\n`;
  writeFileSync(FILE, JSON.stringify(current, null, 2));
}
