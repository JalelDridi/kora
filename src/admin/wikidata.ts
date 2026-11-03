import "server-only";
import { FakeGitHub } from "./github/fake.ts";
import { fakeWikidataFetch } from "./wikidata-search.ts";

// The add page's Wikidata (T-AD-5). KORA_ADMIN_FAKES (the browser tests)
// answers from the fakes file's `search` state and is refused on Vercel, as
// for GitHub (src/admin/github/index.ts); otherwise the network. No key.
export function getWikidataFetch(): typeof fetch {
  const fakes = process.env.KORA_ADMIN_FAKES;
  if (fakes) {
    if (process.env.VERCEL)
      throw new Error("KORA_ADMIN_FAKES is for tests only");
    const github = new FakeGitHub({ files: {}, file: fakes });
    return fakeWikidataFetch(() => github.state.search);
  }
  return (input, init) => fetch(input, init);
}
