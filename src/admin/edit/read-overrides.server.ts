import "server-only";
import { getGitHub, GitHubError } from "../github/index.ts";
import type { GitHub } from "../github/index.ts";
import { DEPLOYMENT_DATA } from "./commit.server.ts";

// What the editor and the add page show of data/overrides.json: main's
// copy, so a save made a minute ago shows; else the deployed file, with
// saving off and a notice that says why.

export type OverridesRead = {
  text: string;
  /** null: saving is off (no GitHub, or it could not be read). */
  github: GitHub | null;
  notice: string | null;
};

export async function readOverrides(): Promise<OverridesRead> {
  const deployed = async () => (await DEPLOYMENT_DATA.read("overrides.json"))!;
  const github = getGitHub();
  if (!github)
    return {
      text: await deployed(),
      github: null,
      notice:
        "GitHub not connected: showing the deployed overrides; saving is off.",
    };
  try {
    return {
      text: (await github.readFile("data/overrides.json")).text,
      github,
      notice: null,
    };
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    return {
      text: await deployed(),
      github: null,
      notice: `GitHub could not be read (${error.message}): showing the deployed overrides; saving is off.`,
    };
  }
}
