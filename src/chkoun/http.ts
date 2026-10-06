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

/**
 * The request body as text, read no further than `max` bytes; null when it
 * is longer. A body sent without Content-Length (chunked) is cut off at the
 * limit instead of being read in full first.
 */
export async function readCapped(
  request: Request,
  max: number,
): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
