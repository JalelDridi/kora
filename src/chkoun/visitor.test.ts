import { describe, expect, it } from "vitest";
import {
  LEGACY_COOKIE_PATH,
  newVisitorCookie,
  readVisitorId,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE,
  VISITOR_COOKIE_PATH,
  widenVisitorCookie,
} from "./visitor.ts";

const id = "4b5c0f3e-2d1a-4c8e-9f7b-1a2b3c4d5e6f";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("the visitor id", () => {
  it("a missing or malformed cookie gives no id", () => {
    expect(readVisitorId(null)).toBeNull();
    expect(readVisitorId("")).toBeNull();
    expect(readVisitorId("other=1")).toBeNull();
    expect(readVisitorId("kora_v=")).toBeNull();
    expect(readVisitorId("kora_v=not-a-uuid")).toBeNull();
    // Version 1, not 4.
    expect(readVisitorId("kora_v=4b5c0f3e-2d1a-1c8e-9f7b-1a2b3c4d5e6f")).toBe(
      null,
    );
    expect(readVisitorId(`kora_v=${id.toUpperCase()}`)).toBeNull();
    expect(readVisitorId(`xkora_v=${id}`)).toBeNull();
  });

  it("reads the id among other cookies", () => {
    expect(readVisitorId(`kora_v=${id}`)).toBe(id);
    expect(readVisitorId(`a=1; kora_v=${id}; b=2`)).toBe(id);
  });

  it("newVisitorCookie is HttpOnly, Secure, SameSite=Lax, Path=/api, Max-Age 34,128,000 (13 months), value a UUID v4", () => {
    const cookie = newVisitorCookie(true);
    expect(cookie.name).toBe(VISITOR_COOKIE);
    expect(VISITOR_COOKIE).toBe("kora_v");
    expect(cookie.value).toMatch(UUID_V4);
    expect(cookie.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api",
      maxAge: 34_128_000,
    });
    expect(VISITOR_COOKIE_MAX_AGE).toBe(34_128_000);
    expect(newVisitorCookie(true).value).not.toBe(cookie.value);
    expect(readVisitorId(`kora_v=${cookie.value}`)).toBe(cookie.value);
  });

  it("Secure is left out only for plain-HTTP local runs", () => {
    expect(newVisitorCookie(false).options.secure).toBe(false);
    for (const c of widenVisitorCookie(id, false))
      expect(c.options.secure).toBe(false);
  });

  it("a new cookie is sent to every game's API (Path=/api)", () => {
    expect(VISITOR_COOKIE_PATH).toBe("/api");
    expect(LEGACY_COOKIE_PATH).toBe("/api/chkoun");
    expect(newVisitorCookie(true).options.path).toBe("/api");
  });

  it("widening keeps the id and expires the old /api/chkoun copy", () => {
    const [now, old] = widenVisitorCookie(id, true);
    expect(now).toMatchObject({
      name: "kora_v",
      value: id,
      options: { path: "/api", maxAge: 34_128_000, httpOnly: true },
    });
    expect(old).toMatchObject({
      name: "kora_v",
      value: "",
      options: { path: "/api/chkoun", maxAge: 0, httpOnly: true },
    });
    expect(widenVisitorCookie(id, true)).toHaveLength(2);
  });
});
