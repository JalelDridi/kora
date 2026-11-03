import "server-only";
import { getGitHub, GitHubError } from "../github/index.ts";
import type { GitHub } from "../github/index.ts";
import { DEPLOYMENT_DATA } from "./commit.server.ts";

// What the editor, the add page and the settings pages show of a data file:
// main's copy, so a save made a minute ago shows; else the deployed file,
// with saving off and a notice that says why.

export type OverridesRead = {
  text: string;
  /** null: saving is off (no GitHub, or it could not be read). */
  github: GitHub | null;
  notice: string | null;
};

/** `path` ("data/curated/honours.json") on main, else the deployed copy. */
export async function readFromMain(
  path: string,
  /** What the notice calls it: "the deployed <what>". */
  what: string,
): Promise<OverridesRead> {
  const deployed = async () =>
    (await DEPLOYMENT_DATA.read(path.slice("data/".length)))!;
  const github = getGitHub();
  if (!github)
    return {
      text: await deployed(),
      github: null,
      notice: `GitHub not connected: showing the deployed ${what}; saving is off.`,
    };
  try {
    return { text: (await github.readFile(path)).text, github, notice: null };
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    return {
      text: await deployed(),
      github: null,
      notice: `GitHub could not be read (${error.message}): showing the deployed ${what}; saving is off.`,
    };
  }
}

export const readOverrides = (): Promise<OverridesRead> =>
  readFromMain("data/overrides.json", "overrides");
