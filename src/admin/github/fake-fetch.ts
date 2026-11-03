import { createHash } from "node:crypto";

// A stand-in for api.github.com in unit tests: an injected `fetch` that
// answers the requests HttpGitHub makes, in GitHub's own JSON shapes, from a
// Map of file texts on main. It records every request (URL, method, headers,
// body) so a test can check what would have gone over the wire. Only the
// routes the client uses are known; anything else answers 404.

export type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type FakeFetchOptions = {
  /** Every answer has this status (an outage, a bad token). */
  status?: number;
  /** The `github-authentication-token-expiration` header on every answer. */
  expiration?: string;
};

const API = "https://api.github.com/repos/JalelDridi/kora";

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");
const gitBlobSha = (text: string) =>
  sha1(`blob ${Buffer.byteLength(text)}\0${text}`);

type Commit = {
  sha: string;
  parent: string;
  message: string;
  date: string;
  path: string;
  before: string | undefined;
};

export function fakeGitHubFetch(
  seed: Record<string, string>,
  options: FakeFetchOptions = {},
) {
  const files = new Map(Object.entries(seed));
  const blobs = new Map<string, string>();
  const commits: Commit[] = []; // newest first
  const runs: Record<string, unknown>[] = [];
  const requests: RecordedRequest[] = [];
  const root = sha1("root");
  const head = () => commits[0]?.sha ?? root;

  /** main's file texts as they were at `ref` (main, or a commit sha). */
  const treeAt = (ref: string): Map<string, string> => {
    if (ref === "main" || ref === head()) return files;
    const tree = new Map(files);
    for (const commit of commits) {
      if (commit.sha === ref) return tree;
      if (commit.before === undefined) tree.delete(commit.path);
      else tree.set(commit.path, commit.before);
    }
    return ref === root ? tree : new Map();
  };

  const headerMap = (): Record<string, string> => ({
    "x-github-request-id": "ABCD:1234",
    ...(options.expiration
      ? { "github-authentication-token-expiration": options.expiration }
      : {}),
  });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headerMap() },
    });
  const commitJson = (c: Commit) => ({
    sha: c.sha,
    html_url: `https://github.com/JalelDridi/kora/commit/${c.sha}`,
    parents: [{ sha: c.parent }],
    commit: {
      message: c.message,
      author: { name: "Jalel", date: c.date },
      committer: { name: "GitHub", date: c.date },
    },
  });

  function answer(url: URL, method: string, body: unknown): Response {
    if (options.status && options.status >= 400)
      return json(options.status, { message: "Server Error test-token" });
    if (!url.href.startsWith(`${API}/`)) return json(404, {});
    const route = url.pathname.replace("/repos/JalelDridi/kora/", "");
    const q = url.searchParams;

    const contents = /^contents\/(.+)$/.exec(route);
    if (contents && method === "GET") {
      const path = contents[1].split("/").map(decodeURIComponent).join("/");
      const text = treeAt(q.get("ref") ?? "main").get(path);
      if (text === undefined) return json(404, { message: "Not Found" });
      const sha = gitBlobSha(text);
      blobs.set(sha, text);
      return json(200, { type: "file", path, sha, size: text.length });
    }
    if (contents && method === "PUT") {
      const path = contents[1].split("/").map(decodeURIComponent).join("/");
      const put = body as {
        message: string;
        content: string;
        sha?: string;
        branch: string;
      };
      const current = files.get(path);
      if (put.branch !== "main") return json(422, {});
      if (current !== undefined && put.sha !== gitBlobSha(current))
        return json(409, { message: "does not match" });
      const text = Buffer.from(put.content, "base64").toString("utf8");
      const commit: Commit = {
        sha: sha1(`${head()}${path}${text}${commits.length}`),
        parent: head(),
        message: put.message,
        date: new Date().toISOString(),
        path,
        before: current,
      };
      files.set(path, text);
      commits.unshift(commit);
      // GitHub's documented 200 answer: `commit` is a git commit object.
      const sha = gitBlobSha(text);
      const git = `${API}/git`;
      return json(200, {
        content: {
          name: path.split("/").at(-1),
          path,
          sha,
          size: Buffer.byteLength(text),
          url: `${API}/contents/${path}`,
          html_url: `https://github.com/JalelDridi/kora/blob/main/${path}`,
          git_url: `${git}/blobs/${sha}`,
          download_url: `https://raw.githubusercontent.com/JalelDridi/kora/main/${path}`,
          type: "file",
        },
        commit: {
          sha: commit.sha,
          node_id: "C_fake",
          url: `${git}/commits/${commit.sha}`,
          html_url: `https://github.com/JalelDridi/kora/git/commit/${commit.sha}`,
          author: { date: commit.date, name: "Jalel", email: "j@example.com" },
          committer: {
            date: commit.date,
            name: "Jalel",
            email: "j@example.com",
          },
          message: commit.message,
          tree: { url: `${git}/trees/${sha1(text)}`, sha: sha1(text) },
          parents: [
            {
              url: `${git}/commits/${commit.parent}`,
              html_url: `https://github.com/JalelDridi/kora/commit/${commit.parent}`,
              sha: commit.parent,
            },
          ],
          verification: {
            verified: false,
            reason: "unsigned",
            signature: null,
            payload: null,
            verified_at: null,
          },
        },
      });
    }
    const blob = /^git\/blobs\/([0-9a-f]{40})$/.exec(route);
    if (blob && method === "GET") {
      const text = blobs.get(blob[1]);
      if (text === undefined) return json(404, {});
      return new Response(text, { status: 200, headers: headerMap() });
    }
    if (route === "commits" && method === "GET") {
      const path = q.get("path");
      const list = commits
        .filter((c) => c.path === path)
        .slice(0, Number(q.get("per_page") ?? 30));
      return json(200, list.map(commitJson));
    }
    const one = /^commits\/([0-9a-f]{40})$/.exec(route);
    if (one && method === "GET") {
      const c = commits.find((x) => x.sha === one[1]);
      if (!c) return json(404, {});
      return json(200, { ...commitJson(c), files: [{ filename: c.path }] });
    }
    const dispatch = /^actions\/workflows\/([\w.-]+)\/dispatches$/.exec(route);
    if (dispatch && method === "POST") {
      const id = runs.length + 1;
      runs.unshift({
        id,
        workflow: dispatch[1],
        status: "queued",
        conclusion: null,
        event: "workflow_dispatch",
        created_at: new Date().toISOString(),
        html_url: `https://github.com/JalelDridi/kora/actions/runs/${id}`,
        head_sha: head(),
      });
      return json(200, { workflow_run_id: id });
    }
    const list = /^actions\/workflows\/([\w.-]+)\/runs$/.exec(route);
    if (list && method === "GET") {
      const found = runs
        .filter((r) => r.workflow === list[1])
        .filter((r) => !q.get("head_sha") || r.head_sha === q.get("head_sha"))
        .slice(0, Number(q.get("per_page") ?? 30));
      return json(200, { total_count: found.length, workflow_runs: found });
    }
    if (route === "pulls" && method === "GET") return json(200, []);
    return json(404, { message: "Not Found" });
  }

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method, headers, body });
    return answer(url, method, body);
  }) as typeof globalThis.fetch;

  return { fetch, requests };
}
