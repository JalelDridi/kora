import { createPoliteClient, HttpError } from "../http.ts";
import type { FetchLike } from "../http.ts";
import { isAllowed, NO_ROBOTS, parseRobots } from "./robots.ts";
import type { Robots } from "./robots.ts";

// The polite site client of the private witness (B2, S26, S27): one host,
// robots.txt read first, at least max(gap, Crawl-delay) between request
// starts, a request cap, no retry, only an honest User-Agent, and the first
// refusal (403, 429, 503, a redirect, or a challenge page) stops the site
// for the rest of the run. Nothing here gets around a block.

/** Words of a bot challenge or consent wall in a 200 answer. */
export const CHALLENGE_MARKERS = [
  "Just a moment",
  "cf-chl",
  "captcha",
  "datadome",
] as const;

/** The site refused, or answered in a way that ends this run for it. */
export class SiteStopped extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteStopped";
  }
}

/** A path robots.txt disallows, or a request past the cap: nothing was sent. */
export class SiteRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteRefusal";
  }
}

export type SiteClient = {
  /** The page at `path` on the host; throws SiteStopped or SiteRefusal. */
  get(path: string): Promise<string>;
  /** Why the site stopped, or null. */
  stopped(): string | null;
  /** Requests sent so far, robots.txt included. */
  requests(): number;
  /** robots.txt as read (after the first `get`). */
  robots(): Robots | null;
  /** robots.txt as sent, for the private folder; null before the first `get` or when missing. */
  robotsText(): string | null;
};

export function createSiteClient(options: {
  host: string;
  gapMs: number;
  maxRequests: number;
  userAgent: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): SiteClient {
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const http = createPoliteClient({
    minGapMs: 0, // the gap is kept here, once robots.txt is read
    maxRetries: 0,
    maxAttempts: options.maxRequests,
    userAgent: options.userAgent,
    apiUserAgent: false,
    redirect: "manual",
    fetch: options.fetch,
    sleep,
    now,
  });
  let robots: Robots | null = null;
  let robotsText: string | null = null;
  let stopped: string | null = null;
  let sent = 0;
  let lastStart = Number.NEGATIVE_INFINITY;
  const gap = () =>
    Math.max(options.gapMs, (robots?.crawlDelaySec ?? 0) * 1000);

  const origin = `https://${options.host}`;
  /** Only a plain path on this host: never another host, whatever a page links. */
  function urlOf(path: string): string {
    const odd =
      !path.startsWith("/") ||
      path.startsWith("//") ||
      /[\\@]/.test(path) ||
      /[\u0000-\u001f\s]/.test(path);
    const url = odd ? null : new URL(path, origin);
    if (!url || url.origin !== origin || url.protocol !== "https:")
      throw new SiteRefusal(
        `${options.host}: refused to follow ${JSON.stringify(path)}, not a plain path on this host`,
      );
    return url.href;
  }

  async function fetchText(
    path: string,
  ): Promise<{ status: number; text: string }> {
    if (stopped) throw new SiteStopped(stopped);
    if (sent >= options.maxRequests)
      throw new SiteRefusal(
        `${options.host}: ${sent} requests sent, the most this run allows`,
      );
    const wait = lastStart + gap() - now();
    if (wait > 0) await sleep(wait);
    lastStart = now();
    sent++;
    const url = urlOf(path);
    let text: string;
    try {
      text = await http.getText(url);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 0;
      // A missing robots.txt is no refusal: no extra rules (B2).
      if (status === 404 && path === "/robots.txt") return { status, text: "" };
      stopped = `${options.host} answered ${status === 0 ? (error as Error).message : `HTTP ${status}`} for ${path}; nothing more is sent to it this run`;
      throw new SiteStopped(stopped);
    }
    // Any answer, robots.txt included: a challenge page stops the site.
    const marker = CHALLENGE_MARKERS.find((m) =>
      text.toLowerCase().includes(m.toLowerCase()),
    );
    if (marker) {
      stopped = `${options.host} answered ${path} with a challenge page ("${marker}"); nothing more is sent to it this run`;
      throw new SiteStopped(stopped);
    }
    return { status: 200, text };
  }

  return {
    async get(path) {
      if (stopped) throw new SiteStopped(stopped);
      urlOf(path); // an odd path is refused before any request, robots.txt included
      if (robots === null) {
        const answer = await fetchText("/robots.txt");
        robotsText = answer.status === 404 ? null : answer.text;
        robots =
          answer.status === 404
            ? NO_ROBOTS
            : parseRobots(answer.text, options.userAgent.split("/")[0]);
      }
      if (!isAllowed(robots, path))
        throw new SiteRefusal(
          `robots.txt of ${options.host} disallows ${path}`,
        );
      return (await fetchText(path)).text;
    },
    stopped: () => stopped,
    requests: () => sent,
    robots: () => robots,
    robotsText: () => robotsText,
  };
}
