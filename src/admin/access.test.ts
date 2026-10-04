import { describe, expect, it } from "vitest";
import { adminAccess, constantTimeEqual } from "./access";

const password = "correct horse battery staple";
const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;

describe("adminAccess", () => {
  it("hides the pages entirely without a password set", () => {
    expect(adminAccess(basic("jalel", password), undefined)).toBe("not-found");
    expect(adminAccess(null, undefined)).toBe("not-found");
    expect(adminAccess(basic("jalel", ""), "")).toBe("not-found");
  });

  it("hides the pages when the password set is shorter than 16 characters", () => {
    const short = "fifteen-chars-x"; // 15
    expect(adminAccess(basic("jalel", short), short)).toBe("not-found");
    const sixteen = "sixteen-chars-xx";
    expect(adminAccess(basic("jalel", sixteen), sixteen)).toBe("allow");
  });

  it("asks for a password when none is sent", () => {
    expect(adminAccess(null, password)).toBe("challenge");
    expect(adminAccess("", password)).toBe("challenge");
  });

  it("asks again for a wrong password", () => {
    expect(
      adminAccess(basic("jalel", "correct horse battery stapler"), password),
    ).toBe("challenge");
    expect(adminAccess(basic("jalel", "correct horse"), password)).toBe(
      "challenge",
    );
  });

  it("asks again for a malformed header", () => {
    expect(adminAccess("Bearer x", password)).toBe("challenge");
    expect(adminAccess("Basic", password)).toBe("challenge");
    expect(adminAccess("Basic %%%", password)).toBe("challenge");
    expect(adminAccess("Basic a b", password)).toBe("challenge");
    // Base64 of the password with no "user:" in front.
    expect(
      adminAccess(
        `Basic ${Buffer.from(password).toString("base64")}`,
        password,
      ),
    ).toBe("challenge");
  });

  it("lets the right password in, whatever the user name", () => {
    expect(adminAccess(basic("jalel", password), password)).toBe("allow");
    expect(adminAccess(basic("", password), password)).toBe("allow");
    expect(
      adminAccess(`basic  ${basic("x", password).slice(6)}`, password),
    ).toBe("allow");
  });

  it("splits at the first colon, so the password may contain one", () => {
    const withColon = "pass:word:with:colons";
    expect(adminAccess(basic("jalel", withColon), withColon)).toBe("allow");
    // A colon in the user name cannot be told apart (RFC 7617 forbids one).
    expect(
      adminAccess(basic("jalel:pass", "word:with:colons"), withColon),
    ).toBe("allow");
    expect(adminAccess(basic("jalel", "colons"), withColon)).toBe("challenge");
  });

  it("reads the credentials as UTF-8", () => {
    const accented = "mot de passe très long";
    expect(adminAccess(basic("jalel", accented), accented)).toBe("allow");
    expect(
      adminAccess(basic("jalel", "mot de passe tres long"), accented),
    ).toBe("challenge");
  });
});

describe("constantTimeEqual", () => {
  it("compares whole strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("é", "e")).toBe(false);
  });
});
