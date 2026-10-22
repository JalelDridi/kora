import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-S3-14: the 30–0 page is a static shell and its island only calls
// POST /api/season/draft. Nothing it loads at runtime, directly or through
// any chain of `@/` and relative imports, may reach the database, the
// server's season data, the pool file, Node built-ins, the engine, the
// server-side season modules or the KV client. Type-only imports are erased
// at build time, so they are not followed.

const root = path.resolve(import.meta.dirname, "../..");

const page = "src/app/[locale]/season/page.tsx";
const components = readdirSync(path.join(root, "src/components/season"))
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => `src/components/season/${f}`);
const browserModules = ["src/season/device.ts", "src/season/labels.ts"];

/** A specifier refused before it is resolved. */
const forbiddenSpecifier = [/^node:/];
/** A resolved file (relative to the repo root) refused at any depth. */
const forbiddenFile = [
  /^src\/db\//,
  /data\.server/,
  /pool\.json$/,
  // The engine, except the share text: pure, no imports beyond types, and
  // the island builds the text the visitor shares (plan Task 11).
  /^src\/engine\/(?!season\/share\.ts$)/,
  /^src\/season\/(draft|token|play|replay|store)\.ts$/,
  /^src\/chkoun\/kv\.ts$/,
];

type Files = {
  read: (file: string) => string;
  exists: (file: string) => boolean;
};

const disk: Files = {
  read: (file) => readFileSync(path.join(root, file), "utf8"),
  exists: (file) => existsSync(path.join(root, file)),
};

/** The runtime imports of a source: `import type …` and `export type …` are skipped. */
export function runtimeSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const m of source.matchAll(
    /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g,
  ))
    if (!m[2]) specs.push(m[4]);
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g))
    specs.push(m[1]);
  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g))
    specs.push(m[1]);
  for (const m of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g))
    specs.push(m[1]);
  return specs;
}

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The repo file a specifier names, or null for a package (react, next …). */
function resolve(from: string, spec: string, files: Files): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith("."))
    base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS)
    if (files.exists(base + ext) && /\.(tsx?|json)$/.test(base + ext))
      return base + ext;
  throw new Error(`${from}: cannot resolve ${spec}`);
}

/** Every refused import reachable from the entries, as "chain: reason". */
export function forbiddenReach(entries: string[], files: Files): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith(".json")) return;
    for (const spec of runtimeSpecifiers(files.read(file))) {
      const via = [...chain, file].join(" → ");
      if (forbiddenSpecifier.some((r) => r.test(spec))) {
        found.push(`${via} → ${spec}`);
        continue;
      }
      const next = resolve(file, spec, files);
      if (next === null) continue;
      if (forbiddenFile.some((r) => r.test(next))) {
        found.push(`${via} → ${next}`);
        continue;
      }
      walk(next, [...chain, file]);
    }
  };
  for (const entry of entries) walk(entry, []);
  return found;
}

describe("the 30–0 page's imports", () => {
  it("finds the page and the island", () => {
    expect(components).toEqual(
      expect.arrayContaining([
        "src/components/season/island.tsx",
        "src/components/season/pitch.tsx",
        "src/components/season/spin-panel.tsx",
        "src/components/season/candidate-card.tsx",
      ]),
    );
  });

  for (const file of [page, ...components, ...browserModules])
    it(`${file} reaches no server, engine or data module at runtime, at any depth`, () =>
      expect(forbiddenReach([file], disk)).toEqual([]));

  it("the walk follows the imports it allows (it reaches the Chkoun? labels)", () => {
    const reached: string[] = [];
    const spy: Files = {
      read: (f) => (reached.push(f), disk.read(f)),
      exists: disk.exists,
    };
    forbiddenReach(["src/components/season/candidate-card.tsx"], spy);
    expect(reached).toEqual(
      expect.arrayContaining([
        "src/chkoun/labels.ts",
        "src/pipeline/grace.ts",
        "src/season/labels.ts",
      ]),
    );
  });
});

describe("the share text the island loads", () => {
  it("is the only engine file it reaches, and it imports nothing at runtime", () => {
    const reached: string[] = [];
    const spy: Files = {
      read: (f) => (reached.push(f), disk.read(f)),
      exists: disk.exists,
    };
    expect(
      forbiddenReach(["src/components/season/share-button.tsx"], spy),
    ).toEqual([]);
    expect(reached.filter((f) => f.startsWith("src/engine/"))).toEqual([
      "src/engine/season/share.ts",
    ]);
    expect(runtimeSpecifiers(disk.read("src/engine/season/share.ts"))).toEqual(
      [],
    );
  });

  it("any other engine file is still refused", () => {
    const files: Files = {
      read: (f) =>
        ({
          "a.ts": 'import { x } from "@/engine/season/simulate.ts";\n',
        })[f] ?? "",
      exists: (f) => f === "a.ts" || f === "src/engine/season/simulate.ts",
    };
    expect(forbiddenReach(["a.ts"], files)).toEqual([
      "a.ts → src/engine/season/simulate.ts",
    ]);
  });
});

describe("the replay page", () => {
  it("never loads the draft island (plan Task 11)", () => {
    const reached: string[] = [];
    const spy: Files = {
      read: (f) => (reached.push(f), disk.read(f)),
      exists: disk.exists,
    };
    forbiddenReach(["src/app/[locale]/season/r/[day]/[xi]/page.tsx"], spy);
    expect(reached).toContain("src/components/season/result.tsx");
    expect(reached).not.toContain("src/components/season/island.tsx");
  });
});

describe("the walk itself", () => {
  const memory = (map: Record<string, string>): Files => ({
    read: (f) => map[f],
    exists: (f) => f in map,
  });

  it("flags a server module one hop away", () => {
    const files = memory({
      "src/components/season/x.tsx": 'import { hop } from "./hop";\n',
      "src/components/season/hop.ts":
        'import { handleDraft } from "@/season/draft";\n',
      "src/season/draft.ts": "export const handleDraft = 1;\n",
    });
    expect(forbiddenReach(["src/components/season/x.tsx"], files)).toEqual([
      "src/components/season/x.tsx → src/components/season/hop.ts → src/season/draft.ts",
    ]);
  });

  it("flags engine code imported at runtime, not as a type", () => {
    const files = memory({
      "a.ts":
        'import type { Line } from "@/engine/chkoun/types.ts";\nimport { spin } from "@/engine/season/spin.ts";\n',
      "src/engine/chkoun/types.ts": "",
      "src/engine/season/spin.ts": "",
    });
    expect(forbiddenReach(["a.ts"], files)).toEqual([
      "a.ts → src/engine/season/spin.ts",
    ]);
  });

  it("flags Node built-ins and the pool file", () => {
    const files = memory({
      "src/x/a.ts":
        'import { readFile } from "node:fs";\nimport pool from "../../data/pool.json";\n',
      "data/pool.json": "{}",
    });
    expect(forbiddenReach(["src/x/a.ts"], files)).toEqual([
      "src/x/a.ts → node:fs",
      "src/x/a.ts → data/pool.json",
    ]);
  });
});
