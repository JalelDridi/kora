import { describe, expect, it } from "vitest";
import {
  newVisitorCookie,
  readVisitorId,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE,
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

  it("newVisitorCookie is HttpOnly, Secure, SameSite=Lax, Path=/api/chkoun, Max-Age 34,128,000 (13 months), value a UUID v4", () => {
    const cookie = newVisitorCookie(true);
    expect(cookie.name).toBe(VISITOR_COOKIE);
    expect(VISITOR_COOKIE).toBe("kora_v");
    expect(cookie.value).toMatch(UUID_V4);
    expect(cookie.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/chkoun",
      maxAge: 34_128_000,
    });
    expect(VISITOR_COOKIE_MAX_AGE).toBe(34_128_000);
    expect(newVisitorCookie(true).value).not.toBe(cookie.value);
    expect(readVisitorId(`kora_v=${cookie.value}`)).toBe(cookie.value);
  });

  it("Secure is left out only for plain-HTTP local runs", () => {
    expect(newVisitorCookie(false).options.secure).toBe(false);
  });
});
