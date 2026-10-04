// Loaded before every pipeline test: by Vitest as a setup file, and by the
// tests that spawn cli.ts as `node --import <this file>`. Any fetch fails at
// once, so no test can reach Wikidata, Wikipedia, Commons or GitHub.
export const NO_NETWORK = "network is not allowed in tests";

globalThis.fetch = async () => {
  throw new Error(NO_NETWORK);
};
