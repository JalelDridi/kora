import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openStore } from "./store.ts";

const temp = (name: string) => mkdtemp(path.join(tmpdir(), `kora-${name}-`));

describe("the private store (B3, S17)", () => {
  it("defaults to <home>/.kora-witness", async () => {
    const home = await temp("home");
    const store = await openStore({
      env: {},
      home,
      repoRoot: await temp("repo"),
    });
    expect(store.dir).toBe(path.join(home, ".kora-witness"));
    expect(await readdir(home)).toEqual([".kora-witness"]);
  });

  it("refuses a folder inside the repo", async () => {
    const repoRoot = await temp("repo");
    await expect(
      openStore({
        env: { KORA_WITNESS_DIR: path.join(repoRoot, "data", "witness") },
        home: await temp("home"),
        repoRoot,
      }),
    ).rejects.toThrow(/inside the repo/);
    expect(await readdir(repoRoot)).toEqual([]);
  });

  it("writes each page as it arrives, atomically", async () => {
    const dir = await temp("witness");
    const store = await openStore({
      env: { KORA_WITNESS_DIR: dir },
      home: await temp("home"),
      repoRoot: await temp("repo"),
    });
    const file = await store.savePage(
      "transfermarkt",
      "kader 819",
      "<html>1</html>",
    );
    expect(file).toBe(
      path.join(dir, "pages", "transfermarkt", "kader_819.html"),
    );
    expect(await readFile(file, "utf8")).toBe("<html>1</html>");
    await store.savePage("transfermarkt", "kader 819", "<html>2</html>");
    expect(await readFile(file, "utf8")).toBe("<html>2</html>");
    // No temporary file is left beside it.
    expect(await readdir(path.dirname(file))).toEqual(["kader_819.html"]);
  });

  it("keeps backfill state: done ids with dates", async () => {
    const dir = await temp("witness");
    const store = await openStore({
      env: { KORA_WITNESS_DIR: dir },
      home: await temp("home"),
      repoRoot: await temp("repo"),
    });
    expect(await store.readState()).toEqual({
      version: 1,
      nft: {},
      backfill: { done: {} },
    });
    const state = await store.readState();
    state.backfill.done["70782"] = "2026-10-05";
    state.nft["70782"] = { careerFifa: 9, readOn: "2026-10-05" };
    await store.writeState(state);
    expect(
      JSON.parse(await readFile(path.join(dir, "state.json"), "utf8")),
    ).toEqual(state);
  });

  it("a second run resumes where the first stopped", async () => {
    const dir = await temp("witness");
    const where = {
      env: { KORA_WITNESS_DIR: dir },
      home: await temp("home"),
      repoRoot: await temp("repo"),
    };
    const first = await openStore(where);
    const state = await first.readState();
    state.backfill.done["1"] = "2026-10-05";
    await first.writeState(state);
    const second = await openStore(where);
    expect((await second.readState()).backfill.done).toEqual({
      "1": "2026-10-05",
    });
  });
});
