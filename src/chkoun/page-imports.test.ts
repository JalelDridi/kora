import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The game page is a static shell: it must never read the database or the
// day's puzzle, or the answer could end up in its HTML (plan Task 12). This
// follows every local import from the page and fails on a forbidden one.

const src = path.resolve(__dirname, "..");
const FORBIDDEN = [
  /^@\/db(\/|$)/,
  /puzzle\.server/,
  /attributes\.server/,
  /^@\/chkoun\/(guess|today|store|kv|token|copy|nightly)(\.ts)?$/,
  /^@\/pipeline\/calendar/,
];

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ])
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  return null;
}

function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)]
    .map((m) => m[1])
    .concat(
      [...text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    );
}

function walk(entry: string): { files: Set<string>; bad: string[] } {
  const files = new Set<string>();
  const bad: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of imports(file)) {
      if (FORBIDDEN.some((re) => re.test(spec)))
        bad.push(`${path.relative(src, file)} imports ${spec}`);
      const next = resolve(file, spec);
      if (next) queue.push(next);
    }
  }
  return { files, bad };
}

describe("the game page", () => {
  it("imports no database or puzzle module, directly or not", () => {
    const { files, bad } = walk(
      path.join(src, "app", "[locale]", "chkoun", "page.tsx"),
    );
    expect(files.size).toBeGreaterThan(5);
    expect(
      [...files].some((f) => f.endsWith(path.join("chkoun", "game.tsx"))),
    ).toBe(true);
    expect(bad).toEqual([]);
  });

  it("the walker does catch a forbidden import", () => {
    const { bad } = walk(
      path.join(src, "app", "api", "chkoun", "today", "route.ts"),
    );
    expect(bad.length).toBeGreaterThan(0);
  });
});

// The hub (mobile polish M6) is a static page whose cards read today's state
// on the device: it must reach no server module, no database, no pool and
// no pipeline code at runtime. Type-only imports are erased by the build,
// so they are not followed; of the engine, only the day, the record and
// the types may run in the hub.

const HUB_FORBIDDEN = [
  ...FORBIDDEN,
  /\.server(\.ts)?$/,
  /pool\.json$/,
  /^node:/,
  /^@\/pipeline(\/|$)/,
];
const ENGINE = path.join(src, "engine");
const ENGINE_ALLOWED = ["day.ts", "stats.ts", "types.ts"].map((f) =>
  path.join(ENGINE, "chkoun", f),
);

/** Runtime imports only: `import type` and `export type` are skipped. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [
    ...text.matchAll(
      /(?:import|export)\s+(?!type\s)[^"';]*?from\s+["']([^"']+)["']/g,
    ),
    ...text.matchAll(/import\s+["']([^"']+)["']/g),
    ...text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
}

function walkHub(entries: string[]): { files: Set<string>; bad: string[] } {
  const files = new Set<string>();
  const bad: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (file.startsWith(ENGINE) && !ENGINE_ALLOWED.includes(file))
      bad.push(`the hub runs ${path.relative(src, file)}`);
    for (const spec of runtimeImports(file)) {
      if (HUB_FORBIDDEN.some((re) => re.test(spec)))
        bad.push(`${path.relative(src, file)} imports ${spec}`);
      const next = resolve(file, spec);
      if (next) queue.push(next);
    }
  }
  return { files, bad };
}

const HUB_ENTRIES = [
  path.join(src, "app", "[locale]", "page.tsx"),
  path.join(src, "components", "hub-state.tsx"),
  path.join(src, "components", "game-card.tsx"),
];

describe("the hub", () => {
  it("reaches no server, database, pool or pipeline code, and only the day and the record of the engine", () => {
    const { files, bad } = walkHub(HUB_ENTRIES);
    expect(
      [...files].some((f) => f.endsWith(path.join("chkoun", "hub-state.ts"))),
    ).toBe(true);
    expect(bad).toEqual([]);
  });

  it("the hub's walker does catch a pipeline import and a server module", () => {
    const { bad } = walkHub([path.join(src, "chkoun", "labels.ts")]);
    expect(bad.some((b) => b.includes("@/pipeline/"))).toBe(true);
    const server = walkHub([
      path.join(src, "app", "[locale]", "chkoun", "page.tsx"),
    ]);
    expect(server.bad.length).toBeGreaterThan(0);
  });
});
