import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeGitHubFetch } from "./fake-fetch.ts";
import { HttpGitHub } from "./http.ts";
import { GitHubError } from "./types.ts";

afterEach(() => vi.useRealTimers());

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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
    const f = fakeGitHubFetch(
      { "a.json": "1\n" },
      { expiration: "2027-11-01 10:00:00 UTC" },
    );
    const gh = new HttpGitHub("test-token", f.fetch);
    expect(gh.tokenDaysLeft()).toBeNull();
    await gh.readFile("a.json");
    expect(gh.tokenDaysLeft()).toBe(363);
  });
  it("keeps every path inside the repository", async () => {
    const f = fakeGitHubFetch({ "a.json": "1\n" });
    const gh = new HttpGitHub("test-token", f.fetch);
    for (const path of [
      "../../other/repo/contents/x",
      "data/../../../other/repo/contents/x",
      "data/./a.json",
      "data//a.json",
      "/a.json",
      "",
    ]) {
      await expect(gh.readFile(path)).rejects.toMatchObject({ status: 400 });
      await expect(
        gh.commitFile({ path, text: "x", sha: "abc", message: "m" }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(f.requests).toEqual([]);
  });
  it("returns the dispatched run's id, or null on GitHub's older 204", async () => {
    const f = fakeGitHubFetch({});
    expect(
      await new HttpGitHub("test-token", f.fetch).dispatchWorkflow(
        "nightly-data.yml",
        {},
      ),
    ).toBe(1);
    expect(f.requests[0].body).toMatchObject({
      ref: "main",
      return_run_details: true,
    });
    const empty = (async () =>
      new Response(null, { status: 204 })) as typeof fetch;
    expect(
      await new HttpGitHub("test-token", empty).dispatchWorkflow(
        "nightly-data.yml",
        {},
      ),
    ).toBeNull();
  });
});
