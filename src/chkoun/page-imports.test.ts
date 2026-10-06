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
