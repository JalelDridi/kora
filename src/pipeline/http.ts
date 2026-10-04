// The only way the pipeline talks to the network. Wikimedia asks for a
// descriptive User-Agent, a gap between requests, maxlag and Retry-After
// respected; GitHub and Wikidata get the same manners.

export const USER_AGENT =
  "KoraDataBot/0.1 (https://github.com/JalelDridi/kora; nightly data job)";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  readonly status: number;

  constructor(url: string, status: number) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
  }
}

export type PoliteOptions = {
  /** Minimum time between the starts of two requests. */
  minGapMs: number;
  maxRetries: number;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type PoliteClient = {
  getJson(url: string, init?: RequestInit): Promise<unknown>;
  getText(url: string, init?: RequestInit): Promise<string>;
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_WAIT_MS = 300_000;

/** How long to wait before retry number `attempt` (0 for the first). */
export function retryDelayMs(
  retryAfter: string | null,
  attempt: number,
  now: number,
): number {
  if (retryAfter !== null && retryAfter.trim() !== "") {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.max(0, at - now);
  }
  return Math.min(10_000 * 2 ** attempt, 120_000);
}

export function createPoliteClient(options: PoliteOptions): PoliteClient {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  let lastStart = Number.NEGATIVE_INFINITY;

  async function send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart + options.minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const headers = new Headers(init.headers);
      headers.set("User-Agent", USER_AGENT);
      headers.set("Api-User-Agent", USER_AGENT);
      const response = await doFetch(url, { ...init, headers });

      const lagged = response.headers.get("mediawiki-api-error") === "maxlag";
      if (response.ok && !lagged) return response;

      const retryable = lagged || RETRYABLE.has(response.status);
      const delay = retryDelayMs(
        response.headers.get("retry-after"),
        attempt,
        now(),
      );
      await response.body?.cancel();
      if (!retryable || attempt >= options.maxRetries || delay > MAX_WAIT_MS) {
        throw new HttpError(url, response.status);
      }
      await sleep(delay);
    }
  }

  return {
    async getJson(url, init = {}) {
      return (await send(url, init)).json();
    },
    async getText(url, init = {}) {
      return (await send(url, init)).text();
    },
  };
}
