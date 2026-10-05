import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

// B1: the private witness is started by hand only. No workflow, no script
// and no package.json script but `data:witness` may name it.

const root = process.cwd();

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
}

describe("the witness command is never started by automation", () => {
  it("no workflow and no script but data:witness mentions witness-cli", async () => {
    const watched = [
      ...(await files(path.join(".github", "workflows"))),
      ...(await files("scripts")),
    ];
    expect(watched.length).toBeGreaterThan(0);
    for (const file of watched) {
      const text = await readFile(path.join(root, file), "utf8");
      expect(text, file).not.toMatch(/witness/i);
    }
    const pkg = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    const naming = Object.entries(pkg.scripts).filter(
      ([name, command]) => /witness/i.test(name) || /witness/i.test(command),
    );
    expect(naming).toEqual([
      ["data:witness", "node src/pipeline/witness-cli.ts"],
    ]);
  });

  it("the entry point exports nothing, so no module can import and run it", async () => {
    const text = await readFile(
      path.join(root, "src", "pipeline", "witness-cli.ts"),
      "utf8",
    );
    expect(text).not.toMatch(/^export /m);
    // And no other source file imports it.
    const sources = await readdir(path.join(root, "src"), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of sources) {
      if (!entry.isFile() || !/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (file.endsWith("witness-cli.ts") || file.endsWith(".test.ts"))
        continue;
      expect(await readFile(file, "utf8"), file).not.toContain("witness-cli");
    }
  });
});
