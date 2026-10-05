import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { insideRepo, witnessDir } from "./safety.ts";

// The private folder (S17): outside the repo, never committed, never shared
// through a CI cache. It keeps the pages as they arrive, the id mapping, and
// what each run did, so the next run resumes. The sites' values live only
// here.

/** What the witness remembers between runs. */
export type WitnessState = {
  version: 1;
  /** national-football-teams player id → what was last read on his page. */
  nft: Record<
    string,
    {
      /** Career FIFA matches from his player page. */
      careerFifa?: number;
      /** FIFA matches this year from the country page, when his page was read. */
      yearMatches?: number;
      /** The day his page was read. */
      readOn?: string;
      /** His page's path exactly as a country page links it. */
      path?: string;
    }
  >;
  /** Backfill (B8): player ids whose page was read, with the day. */
  backfill: { done: Record<string, string> };
};

export const emptyState = (): WitnessState => ({
  version: 1,
  nft: {},
  backfill: { done: {} },
});

export type Store = {
  dir: string;
  /** Saves a page under pages/<site>/<name>.<ext> as it arrives; returns its path. */
  savePage(
    site: string,
    name: string,
    text: string,
    ext?: "html" | "txt",
  ): Promise<string>;
  /** The saved pages of a site whose name starts with `prefix`, oldest name first. */
  readPages(site: string, prefix: string): Promise<string[]>;
  readJson<T>(name: string): Promise<T | null>;
  writeJson(name: string, value: unknown): Promise<void>;
  readState(): Promise<WitnessState>;
  writeState(state: WitnessState): Promise<void>;
};

/** Writes beside the target, then renames: a crash leaves the old file or the new one. */
async function atomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, text);
  await rename(temp, file);
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_");

export async function openStore(input: {
  env: Record<string, string | undefined>;
  home: string;
  repoRoot: string;
}): Promise<Store> {
  const dir = witnessDir(input.env, input.home);
  if (insideRepo(dir, input.repoRoot))
    throw new Error(
      `the private folder ${dir} is inside the repo ${input.repoRoot}; refusing`,
    );
  await mkdir(dir, { recursive: true });
  const store: Store = {
    dir,
    async savePage(site, name, text, ext = "html") {
      const file = path.join(
        dir,
        "pages",
        safeName(site),
        `${safeName(name)}.${ext}`,
      );
      await atomic(file, text);
      return file;
    },
    async readPages(site, prefix) {
      const folder = path.join(dir, "pages", safeName(site));
      const names = await readdir(folder).catch(() => [] as string[]);
      return Promise.all(
        names
          .filter((n) => n.startsWith(prefix) && n.endsWith(".html"))
          .sort()
          .map((n) => readFile(path.join(folder, n), "utf8")),
      );
    },
    async readJson<T>(name: string) {
      try {
        return JSON.parse(await readFile(path.join(dir, name), "utf8")) as T;
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") return null;
        throw error;
      }
    },
    async writeJson(name, value) {
      await atomic(path.join(dir, name), JSON.stringify(value, null, 2) + "\n");
    },
    async readState() {
      const state = await store.readJson<WitnessState>("state.json");
      return state?.version === 1 ? state : emptyState();
    },
    async writeState(state) {
      await store.writeJson("state.json", state);
    },
  };
  return store;
}
