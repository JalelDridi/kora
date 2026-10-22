import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-S3-14: the 30–0 page is a static shell and its island only calls
// POST /api/season/draft. Neither may reach the database, the server's
// season data or the pool file, and the island imports no engine code (the
// browser bundle stays small and the candidates stay on the server).

const root = path.resolve(import.meta.dirname, "../..");
const page = "src/app/[locale]/season/page.tsx";
const components = readdirSync(path.join(root, "src/components/season"))
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => `src/components/season/${f}`);
const browserModules = ["src/season/device.ts", "src/season/labels.ts"];

const importsOf = (file: string) =>
  [
    ...readFileSync(path.join(root, file), "utf8").matchAll(
      /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2]);

const forbidden = [/^@\/db/, /data\.server/, /pool\.json$/, /^node:/];

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
    it(`${file} imports nothing from @/db, data.server or data/pool.json`, () => {
      for (const spec of importsOf(file))
        for (const rule of forbidden) expect(spec, file).not.toMatch(rule);
    });

  for (const file of [...components, ...browserModules])
    it(`${file} imports no engine module except its types`, () => {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const m of source.matchAll(
        /import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g,
      ))
        if (/engine\//.test(m[2]))
          expect(m[1], `${file}: ${m[2]}`).toBe("type ");
    });
});
