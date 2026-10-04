// Waits for a database that is still starting. Neon suspends a compute after
// five idle minutes and needs a few seconds to start it again; a build whose
// first connection gives up sooner fails (Prisma P1001, seen on a preview).
// Pure: the caller passes the connect function and, in tests, the sleep.

/** Node's errors for a host that does not answer, or not yet. */
const NODE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** Messages from pg and Neon while a compute is unreachable or starting. */
const MESSAGES = [
  /connection timeout/i,
  /timeout expired/i,
  /connection terminated unexpectedly/i,
  /can't reach database server/i,
  /endpoint is starting/i,
];

const SQLSTATE = /^[0-9A-Z]{5}$/;

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * True when the database could not be reached, so trying again can help.
 * False when it answered: a bad password, a missing database or any other
 * SQL error is not fixed by waiting.
 */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = codeOf(error);
  if (code !== null) {
    if (NODE_CODES.has(code)) return true;
    // Class 08 is "connection exception"; 57P03 is "cannot connect now".
    if (code.startsWith("08") || code === "57P03") return true;
    if (SQLSTATE.test(code)) return false;
  }
  return MESSAGES.some((pattern) => pattern.test(error.message));
}

/**
 * A short name for a connection error, safe to print: its code, or
 * "timeout". Never the message, which can carry the host (ENOTFOUND).
 */
export function describeError(error: unknown): string {
  const code = codeOf(error);
  if (code !== null && /^[0-9A-Z_]{1,20}$/.test(code)) return code;
  if (error instanceof Error && /timeout/i.test(error.message))
    return "timeout";
  return "no code";
}

export type RetryOptions = {
  /** Default 4. */
  attempts?: number;
  /** Default 5 000 ms. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** The host as it may be printed (masked). */
  host?: string;
};

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `open` until it succeeds, retrying only connection errors, at most
 * `attempts` times `delayMs` apart; rethrows the last error. `open` must make
 * a new connection each time (a pg Client cannot connect twice).
 */
export async function withConnectionRetry<T>(
  open: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const delayMs = options.delayMs ?? 5000;
  const sleep = options.sleep ?? realSleep;
  const log = options.log ?? (() => {});
  const host = options.host ?? "the database";
  for (let attempt = 1; ; attempt++) {
    try {
      return await open();
    } catch (error) {
      if (attempt >= attempts || !isConnectionError(error)) throw error;
      log(
        `db: ${host} not reachable (${describeError(error)}), attempt ${attempt} of ${attempts}; trying again in ${delayMs / 1000} s`,
      );
      await sleep(delayMs);
    }
  }
}
