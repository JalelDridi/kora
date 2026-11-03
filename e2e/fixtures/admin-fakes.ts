import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { E2E_ENV } from "../../playwright.config";
import type { FakeCommit, FakeState } from "../../src/admin/github/fake.ts";

// The GitHub fake the server under test uses (KORA_ADMIN_FAKES): main holds
// the working tree's data/overrides.json and curated files, with no commit
// yet. The spec reads the state back to see what a save committed.

const FILE = E2E_ENV.KORA_ADMIN_FAKES;

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
    search: {},
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
