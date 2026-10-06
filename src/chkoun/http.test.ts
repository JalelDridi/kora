import { describe, expect, it } from "vitest";
import { clientIp, readCapped, serializeCookie, toResponse } from "./http.ts";
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

describe("readCapped", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/chkoun/guess", {
      method: "POST",
      body,
      headers,
      // Required by Node for a stream body.
      ...({ duplex: "half" } as object),
    });

  it("reads a body within the limit, in UTF-8", async () => {
    expect(await readCapped(post('{"id":"Q1","n":"صالح"}'), 2048)).toBe(
      '{"id":"Q1","n":"صالح"}',
    );
    expect(await readCapped(post(""), 2048)).toBe("");
  });

  it("refuses a declared length over the limit without reading", async () => {
    expect(
      await readCapped(post("x", { "content-length": "4096" }), 2048),
    ).toBeNull();
  });

  it("stops reading a chunked body at the limit", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
    });
    expect(await readCapped(post(endless), 2048)).toBeNull();
    // Three chunks of 1 KB pass the 2 KB limit; nothing more is pulled.
    expect(pulled).toBeLessThanOrEqual(4);
  });
});
