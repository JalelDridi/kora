import { describe, expect, it } from "vitest";
import { clientIp, serializeCookie, toResponse } from "./http.ts";
import { newVisitorCookie } from "./visitor.ts";

describe("the game API's responses", () => {
  it("are never cached and carry the status and body", async () => {
    const r = toResponse({
      status: 429,
      body: { error: "tooMany", retryAfter: 60 },
      headers: { "Retry-After": "60" },
    });
    expect(r.status).toBe(429);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("retry-after")).toBe("60");
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toEqual({ error: "tooMany", retryAfter: 60 });
  });

  it("set the visitor cookie HttpOnly, SameSite=Lax, on the API path only", () => {
    const cookie = newVisitorCookie(true);
    const r = toResponse({ status: 200, body: {}, setCookie: cookie });
    expect(r.headers.get("set-cookie")).toBe(
      `kora_v=${cookie.value}; Max-Age=34128000; Path=/api/chkoun; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(serializeCookie(newVisitorCookie(false))).not.toContain("Secure");
  });

  it("read the visitor's address from the first forwarded hop", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIp(new Headers())).toBeNull();
  });
});
