import type { ApiResult } from "./guess.ts";
import type { VisitorCookie } from "./visitor.ts";

// The game API's answers as HTTP responses: never cached, never indexed,
// the visitor cookie serialized by hand so this module needs no Next.

const PRIVATE = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};

export function serializeCookie(cookie: VisitorCookie): string {
  const o = cookie.options;
  return [
    `${cookie.name}=${cookie.value}`,
    `Max-Age=${o.maxAge}`,
    `Path=${o.path}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(o.secure ? ["Secure"] : []),
  ].join("; ");
}

export function toResponse(result: ApiResult): Response {
  const headers = new Headers({ ...PRIVATE, ...result.headers });
  if (result.setCookie)
    headers.append("Set-Cookie", serializeCookie(result.setCookie));
  return Response.json(result.body, { status: result.status, headers });
}

/** The visitor's address as Vercel's edge reports it; null when unknown. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}
