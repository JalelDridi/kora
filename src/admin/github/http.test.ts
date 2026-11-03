import { describe, expect, it } from "vitest";
import { fakeGitHubFetch } from "./fake-fetch.ts";
import { HttpGitHub } from "./http.ts";
import { GitHubError } from "./types.ts";

describe("HttpGitHub", () => {
  it("sends the token as a bearer header and never puts it in an error", async () => {
    const gh = new HttpGitHub(
      "test-token",
      fakeGitHubFetch({}, { status: 500 }).fetch,
    );
    const error = await gh
      .readFile("data/overrides.json")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ status: 500, what: "readFile" });
    expect(String(error) + JSON.stringify(error)).not.toContain("test-token");
    expect(String(error)).not.toContain("api.github.com");
  });
  it("asks only for JalelDridi/kora and main", async () => {
    const f = fakeGitHubFetch({ "data/curated/honours.json": "[]\n" });
    await new HttpGitHub("test-token", f.fetch).readFile(
      "data/curated/honours.json",
    );
    expect(
      f.requests.every((r) =>
        r.url.startsWith("https://api.github.com/repos/JalelDridi/kora/"),
      ),
    ).toBe(true);
    expect(f.requests[0].headers.authorization).toBe("Bearer test-token");
    expect(f.requests[0].url).toContain("ref=main");
  });
  it("commits on main with the text in base64 and the read sha", async () => {
    const f = fakeGitHubFetch({ "a.json": "1\n" });
    const gh = new HttpGitHub("test-token", f.fetch);
    const { sha } = await gh.readFile("a.json");
    await gh.commitFile({ path: "a.json", text: "2\n", sha, message: "m" });
    const put = f.requests.find((r) => r.method === "PUT")!;
    expect(put.body).toEqual({
      message: "m",
      content: Buffer.from("2\n").toString("base64"),
      sha,
      branch: "main",
    });
  });
  it("wraps a network failure without its details", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed: https://api.github.com/?x=test-token");
    }) as typeof fetch;
    const error = await new HttpGitHub("test-token", failing)
      .getCommit("abc")
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, what: "getCommit" });
    expect(String(error) + JSON.stringify(error)).not.toContain("test-token");
  });
  it("reads the token's expiry from the response header", async () => {
    const f = fakeGitHubFetch(
      { "a.json": "1\n" },
      { expiration: "2027-11-01 10:00:00 UTC" },
    );
    const gh = new HttpGitHub("test-token", f.fetch);
    expect(gh.tokenDaysLeft()).toBeNull();
    await gh.readFile("a.json");
    expect(gh.tokenDaysLeft()).toBeGreaterThan(300);
  });
});
