import "server-only";
import { FakeGitHub } from "./fake.ts";
import { HttpGitHub } from "./http.ts";
import type { GitHub } from "./types.ts";

export * from "./types.ts";

// The one place that reads the dashboard's GitHub token (decision P60).
// KORA_ADMIN_FAKES (the browser tests) wins and is refused on Vercel; then
// the token; without either the dashboard reads but its save, undo and
// rebuild buttons say edits are off here (Preview, local runs).
export function getGitHub(): GitHub | null {
  const fakes = process.env.KORA_ADMIN_FAKES;
  if (fakes) {
    if (process.env.VERCEL)
      throw new Error("KORA_ADMIN_FAKES is for tests only");
    return new FakeGitHub({ files: {}, file: fakes });
  }
  const token = process.env.KORA_GITHUB_TOKEN;
  if (token) return new HttpGitHub(token, (input, init) => fetch(input, init));
  return null;
}
