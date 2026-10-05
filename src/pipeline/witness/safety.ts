import path from "node:path";

// The private witness (decisions P43, P44, P48) runs on Jalel's PC, by hand,
// and nowhere else. Pure: the entry point asks these before it creates any
// client, and a test can ask them without a network.

/** Environments where the witness never runs: CI, GitHub Actions, a test run. */
export const FORBIDDEN_ENV = ["CI", "GITHUB_ACTIONS", "VITEST"] as const;

/** S17: the private folder, outside the repo; KORA_WITNESS_DIR overrides it. */
export function witnessDir(
  env: Record<string, string | undefined>,
  home: string,
): string {
  const set = env.KORA_WITNESS_DIR?.trim();
  return path.resolve(set ? set : path.join(home, ".kora-witness"));
}

/** Is `dir` the repo or inside it? Case-insensitive on Windows. */
export function insideRepo(dir: string, repoRoot: string): boolean {
  const fold = (p: string) =>
    process.platform === "win32"
      ? path.resolve(p).toLowerCase()
      : path.resolve(p);
  const rel = path.relative(fold(repoRoot), fold(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Why the command must not run here at all (exit 2), or null. Any of CI,
 * GITHUB_ACTIONS or VITEST set (to anything but an empty string) refuses, as
 * does a private folder inside the repo: one `git add -A` from public.
 */
export function environmentRefusal(
  env: Record<string, string | undefined>,
  where: { repoRoot: string; home: string },
): string | null {
  const set = FORBIDDEN_ENV.filter((name) => (env[name] ?? "") !== "");
  if (set.length > 0)
    return `refused: ${set.join(", ")} ${set.length === 1 ? "is" : "are"} set; the private witness runs only by hand on Jalel's PC`;
  const dir = witnessDir(env, where.home);
  if (insideRepo(dir, where.repoRoot))
    return `refused: the private folder ${dir} is inside the repo; set KORA_WITNESS_DIR to a folder outside it`;
  return null;
}

/**
 * Why no request may be sent (B1), or null when a live run may go ahead:
 * every environment refusal, and no `--live` on the command line.
 */
export function refuseReason(
  env: Record<string, string | undefined>,
  argv: readonly string[],
  where: { repoRoot: string; home: string },
): string | null {
  const refused = environmentRefusal(env, where);
  if (refused) return refused;
  if (!argv.includes("--live"))
    return "dry run: no --live, so no request is sent";
  return null;
}
