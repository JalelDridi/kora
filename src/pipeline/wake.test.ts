import { describe, expect, it } from "vitest";
import { isConnectionError, withConnectionRetry } from "./wake.ts";

// A Neon compute suspended after five idle minutes takes a few seconds to
// start; the first connection of a build must wait for it, and nothing else.

const failing = (error: object) => {
  const e = Object.assign(new Error("connect failed"), error);
  return e;
};

function fakeConnect(failures: unknown[], value = "connected") {
  const calls: number[] = [];
  return {
    calls,
    open: async () => {
      calls.push(calls.length + 1);
      const next = failures.shift();
      if (next !== undefined) throw next;
      return value;
    },
  };
}

function recorder() {
  const sleeps: number[] = [];
  const lines: string[] = [];
  return {
    sleeps,
    lines,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    log: (line: string) => {
      lines.push(line);
    },
  };
}

describe("isConnectionError", () => {
  it("is true for a database that is not reachable yet", () => {
    for (const code of [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ECONNRESET",
      "EAI_AGAIN",
      "57P03",
      "08006",
    ])
      expect(isConnectionError(failing({ code })), code).toBe(true);
    expect(
      isConnectionError(
        new Error("Connection terminated due to connection timeout"),
      ),
    ).toBe(true);
    expect(
      isConnectionError(new Error("Can't reach database server at host:5432")),
    ).toBe(true);
    expect(
      isConnectionError(new Error("The endpoint is starting, try again")),
    ).toBe(true);
  });

  it("is false for a database that answered no", () => {
    for (const code of ["28P01", "3D000", "28000", "42P01"])
      expect(isConnectionError(failing({ code })), code).toBe(false);
    // A real SQL error whose words happen to mention a timeout.
    expect(
      isConnectionError(
        failing({
          code: "57014",
          message: "canceling statement due to statement timeout",
        }),
      ),
    ).toBe(false);
    expect(isConnectionError("timeout")).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe("withConnectionRetry", () => {
  it("waits 5 s between attempts until the database answers", async () => {
    const connect = fakeConnect([
      failing({ code: "ETIMEDOUT" }),
      failing({ code: "ECONNREFUSED" }),
    ]);
    const r = recorder();

    await expect(
      withConnectionRetry(connect.open, {
        sleep: r.sleep,
        log: r.log,
        host: "***.neon.tech",
      }),
    ).resolves.toBe("connected");
    expect(connect.calls).toEqual([1, 2, 3]);
    expect(r.sleeps).toEqual([5000, 5000]);
    expect(r.lines).toEqual([
      "db: ***.neon.tech not reachable (ETIMEDOUT), attempt 1 of 4; trying again in 5 s",
      "db: ***.neon.tech not reachable (ECONNREFUSED), attempt 2 of 4; trying again in 5 s",
    ]);
  });

  it("does not retry a database that refused the credentials", async () => {
    const denied = failing({ code: "28P01" });
    const connect = fakeConnect([denied]);
    const r = recorder();

    await expect(withConnectionRetry(connect.open, r)).rejects.toBe(denied);
    expect(connect.calls).toEqual([1]);
    expect(r.sleeps).toEqual([]);
  });

  it("gives up after 4 attempts with the last error", async () => {
    const errors = [1, 2, 3, 4].map((n) =>
      failing({ code: "ECONNREFUSED", n }),
    );
    const connect = fakeConnect([...errors]);
    const r = recorder();

    await expect(withConnectionRetry(connect.open, r)).rejects.toBe(errors[3]);
    expect(connect.calls).toEqual([1, 2, 3, 4]);
    expect(r.sleeps).toEqual([5000, 5000, 5000]);
  });

  it("never logs the URL or the host from an error message", async () => {
    const lost = Object.assign(
      new Error(
        "getaddrinfo ENOTFOUND ep-secret-name.eu-central-1.aws.neon.tech postgresql://u:p@ep-secret-name",
      ),
      { code: "ENOTFOUND" },
    );
    const connect = fakeConnect([lost]);
    const r = recorder();

    await withConnectionRetry(connect.open, {
      ...r,
      host: "***.eu-central-1.aws.neon.tech",
    });
    expect(r.lines.join("\n")).not.toMatch(/ep-secret-name|postgresql:\/\//);
    expect(r.lines[0]).toContain("(ENOTFOUND)");
  });
});
