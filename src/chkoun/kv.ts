import type { Redis } from "@upstash/redis";
import { getRedis } from "@/redis";

// The few Redis commands Chkoun? uses, behind one small interface so the
// game's modules are tested with FakeKv and never reach Upstash. Values are
// text: Upstash's client turns JSON it reads back into objects, so the
// adapter turns them back into text and callers parse what they stored.
//
// One Upstash database serves Production and Preview (free plan), so every
// key starts with kora:{VERCEL_ENV or "local"}: (plan, reading 5).

export interface Kv {
  get(key: string): Promise<string | null>;
  /** True when the value was written (false when `nx` found the key). */
  set(
    key: string,
    value: string,
    options?: { ex?: number; nx?: boolean },
  ): Promise<boolean>;
  /**
   * HSETNX and EXPIRE in one transaction (MULTI), so the hash never lives
   * without its expiry. True when the field was new.
   */
  hsetnxEx(
    key: string,
    field: string,
    value: string,
    seconds: number,
  ): Promise<boolean>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  /** INCR and EXPIRE in one transaction (MULTI); returns the new count. */
  incrEx(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<void>;
}

/** The environment part of every key: VERCEL_ENV, or "local". */
export function kvEnv(): string {
  return process.env.VERCEL_ENV || "local";
}

/** Every Chkoun? key: kora:{env}:chkoun:… */
export function chkounKey(env: string, rest: string): string {
  return `kora:${env}:chkoun:${rest}`;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Kv over Upstash's REST client. */
export function upstashKv(redis: Redis): Kv {
  return {
    get: async (key) => asText(await redis.get(key)),
    set: async (key, value, options = {}) => {
      const { ex, nx } = options;
      const result =
        ex !== undefined
          ? nx
            ? await redis.set(key, value, { ex, nx: true })
            : await redis.set(key, value, { ex })
          : nx
            ? await redis.set(key, value, { nx: true })
            : await redis.set(key, value);
      return result !== null;
    },
    hsetnxEx: async (key, field, value, seconds) => {
      const [isNew] = await redis
        .multi()
        .hsetnx(key, field, value)
        .expire(key, seconds)
        .exec<[number, number]>();
      return isNew === 1;
    },
    hget: async (key, field) => asText(await redis.hget(key, field)),
    hgetall: async (key) => {
      const all = await redis.hgetall<Record<string, unknown>>(key);
      const out: Record<string, string> = {};
      for (const [field, value] of Object.entries(all ?? {})) {
        const text = asText(value);
        if (text !== null) out[field] = text;
      }
      return out;
    },
    incrEx: async (key, seconds) => {
      const [count] = await redis
        .multi()
        .incr(key)
        .expire(key, seconds)
        .exec<[number, number]>();
      return count;
    },
    del: async (key) => {
      await redis.del(key);
    },
  };
}

let shared: Kv | null | undefined;

/** This instance's Kv, or null when Upstash is not configured (Redis off). */
export function getKv(): Kv | null {
  if (shared === undefined) {
    const redis = getRedis();
    shared = redis ? upstashKv(redis) : null;
  }
  return shared;
}

type Entry = { value: string | Map<string, string>; expiresAt: number | null };

/**
 * An in-memory Kv for tests, with a clock the test moves. `failing` makes
 * every command throw, like an unreachable Upstash; `failOn` makes only the
 * named commands throw. A transaction (hsetnxEx, incrEx) is one command: it
 * applies all of its parts or none.
 */
export class FakeKv implements Kv {
  readonly entries = new Map<string, Entry>();
  readonly commands: string[] = [];
  failing = false;
  readonly failOn = new Set<string>();
  nowMs = 0;

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private run(name: string, key: string): void {
    this.commands.push(`${name} ${key}`);
    if (this.failing || this.failOn.has(name))
      throw new Error("fake Redis is down");
  }

  /** Seconds a key has left; null without expiry, undefined when absent. */
  ttl(key: string): number | null | undefined {
    const entry = this.live(key);
    if (!entry) return undefined;
    return entry.expiresAt === null
      ? null
      : Math.round((entry.expiresAt - this.nowMs) / 1000);
  }

  async get(key: string): Promise<string | null> {
    this.run("get", key);
    const entry = this.live(key);
    return typeof entry?.value === "string" ? entry.value : null;
  }

  async set(
    key: string,
    value: string,
    options: { ex?: number; nx?: boolean } = {},
  ): Promise<boolean> {
    this.run("set", key);
    if (options.nx && this.live(key)) return false;
    this.entries.set(key, {
      value,
      expiresAt:
        options.ex !== undefined ? this.nowMs + options.ex * 1000 : null,
    });
    return true;
  }

  /** A bare HSETNX, without expiry: for tests that seed a hash. */
  async hsetnx(key: string, field: string, value: string): Promise<boolean> {
    this.run("hsetnx", key);
    return this.hsetnxNow(key, field, value);
  }

  private hsetnxNow(key: string, field: string, value: string): boolean {
    let entry = this.live(key);
    if (!entry) {
      entry = { value: new Map(), expiresAt: null };
      this.entries.set(key, entry);
    }
    const hash = entry.value as Map<string, string>;
    if (hash.has(field)) return false;
    hash.set(field, value);
    return true;
  }

  async hsetnxEx(
    key: string,
    field: string,
    value: string,
    seconds: number,
  ): Promise<boolean> {
    this.run("hsetnxEx", key);
    const isNew = this.hsetnxNow(key, field, value);
    this.expireNow(key, seconds);
    return isNew;
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.run("hget", key);
    const entry = this.live(key);
    return entry?.value instanceof Map
      ? (entry.value.get(field) ?? null)
      : null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.run("hgetall", key);
    const entry = this.live(key);
    return entry?.value instanceof Map ? Object.fromEntries(entry.value) : {};
  }

  private expireNow(key: string, seconds: number): void {
    const entry = this.live(key);
    if (entry) entry.expiresAt = this.nowMs + seconds * 1000;
  }

  async incrEx(key: string, seconds: number): Promise<number> {
    this.run("incrEx", key);
    const next = this.incrNow(key);
    this.expireNow(key, seconds);
    return next;
  }

  private incrNow(key: string): number {
    const entry = this.live(key);
    const next = Number(typeof entry?.value === "string" ? entry.value : 0) + 1;
    this.entries.set(key, {
      value: String(next),
      expiresAt: entry?.expiresAt ?? null,
    });
    return next;
  }

  async del(key: string): Promise<void> {
    this.run("del", key);
    this.entries.delete(key);
  }
}
