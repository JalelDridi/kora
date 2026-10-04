// The only way the pipeline talks to the network. Wikimedia asks for a
// descriptive User-Agent, a gap between requests, maxlag and Retry-After
// respected, and a 429 or 403 taken as a request to stop; GitHub and
// Wikidata get the same manners. One client's requests run one at a time,
// in order, so the gap holds however callers overlap their calls.

export const USER_AGENT =
  "KoraData/0.1 (https://github.com/JalelDridi/kora; nightly pool build)";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  readonly status: number;

  constructor(url: string, status: number) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
  }
}

/**
 * The server answered 429 or 403, so this client sends nothing more: the
 * request that got the answer and every later one reject with this error.
 * `status` is the answer that stopped the client.
 */
export class StoppedError extends HttpError {
  constructor(url: string, status: number) {
    super(url, status);
    this.name = "StoppedError";
    this.message = `${this.message}: client stopped, no further requests`;
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

const RETRYABLE = new Set([500, 502, 503, 504]);
const STOP = new Set([429, 403]);
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
  let stopped: StoppedError | null = null;
  // Every request waits for the one before it to finish, failed or not.
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue(url: string, init: RequestInit): Promise<Response> {
    const turn = queue.then(() => send(url, init));
    queue = turn.catch(() => undefined);
    return turn;
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (stopped) throw new StoppedError(url, stopped.status);
      const wait = lastStart + options.minGapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const headers = new Headers(init.headers);
      headers.set("User-Agent", USER_AGENT);
      headers.set("Api-User-Agent", USER_AGENT);
      const response = await doFetch(url, { ...init, headers });

      if (STOP.has(response.status)) {
        await response.body?.cancel();
        stopped = new StoppedError(url, response.status);
        throw stopped;
      }

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
      return (await enqueue(url, init)).json();
    },
    async getText(url, init = {}) {
      return (await enqueue(url, init)).text();
    },
  };
}
