import { randomUUID } from "node:crypto";

// The anonymous visitor id (N1 (a)): a random UUID v4 in a first-party
// cookie, created by the server when a visitor finishes a game while Redis
// is on, and only then. Readable by the server only (HttpOnly), sent only to
// the games' API (Path=/api), kept 13 months. It holds no personal data and
// is never sent to PostHog or Sentry. Until Sprint 3 it lived under
// /api/chkoun; widenVisitorCookie moves a visitor's id to /api (T-S3-9).

export const VISITOR_COOKIE = "kora_v";
/** 13 months of 30.5 days, rounded: 395 days. */
export const VISITOR_COOKIE_MAX_AGE = 34_128_000;
export const VISITOR_COOKIE_PATH = "/api";
/** Where the cookie lived before Sprint 3: only its expiring copy is sent. */
export const LEGACY_COOKIE_PATH = "/api/chkoun";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The visitor id in a Cookie header, or null when absent or malformed. */
export function readVisitorId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== VISITOR_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return UUID_V4.test(value) ? value : null;
  }
  return null;
}

export type VisitorCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

function visitorCookie(
  value: string,
  path: string,
  maxAge: number,
  secure: boolean,
): VisitorCookie {
  return {
    name: VISITOR_COOKIE,
    value,
    options: { httpOnly: true, secure, sameSite: "lax", path, maxAge },
  };
}

/** A new id. `secure` is false only for a plain-HTTP local server. */
export function newVisitorCookie(secure: boolean): VisitorCookie {
  return visitorCookie(
    randomUUID(),
    VISITOR_COOKIE_PATH,
    VISITOR_COOKIE_MAX_AGE,
    secure,
  );
}

/**
 * The same id under /api, for every game, and an expired copy under the old
 * /api/chkoun path, so the browser keeps one cookie and not two.
 */
export function widenVisitorCookie(
  id: string,
  secure: boolean,
): VisitorCookie[] {
  return [
    visitorCookie(id, VISITOR_COOKIE_PATH, VISITOR_COOKIE_MAX_AGE, secure),
    visitorCookie("", LEGACY_COOKIE_PATH, 0, secure),
  ];
}
