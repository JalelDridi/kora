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
  /**
   * ZADD, then ZREMRANGEBYRANK 0 -(keep+1) (only the best `keep` stay),
   * EXPIRE and ZREVRANK, in one transaction (MULTI): the member's rank from
   * the top (0 is the best), or null when it was trimmed away.
   */
  zaddTop(
    key: string,
    member: string,
    score: number,
    keep: number,
    seconds: number,
  ): Promise<number | null>;
  /** The best `n` members, highest score first. */
  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;
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

/** Every 30–0 key: kora:{env}:season:… */
export function seasonKey(env: string, rest: string): string {
  return `kora:${env}:season:${rest}`;
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
    zaddTop: async (key, member, score, keep, seconds) => {
      const [, , , rank] = await redis
        .multi()
        .zadd(key, { score, member })
        .zremrangebyrank(key, 0, -(keep + 1))
        .expire(key, seconds)
        .zrevrank(key, member)
        .exec<[number | null, number, number, number | null]>();
      return rank ?? null;
    },
    ztop: async (key, n) => {
      // With withScores, Upstash answers a flat [member, score, …], each
      // parsed as JSON when it can be: members are turned back into text.
      const flat = await redis.zrange<unknown[]>(key, 0, n - 1, {
        rev: true,
        withScores: true,
      });
      const out: { member: string; score: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2)
        out.push({ member: asText(flat[i]) ?? "", score: Number(flat[i + 1]) });
      return out;
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

/** A sorted set, lowest first, ties by member: Redis's own order. */
type Sorted = { member: string; score: number }[];
type Entry = {
  value: string | Map<string, string> | Sorted;
  expiresAt: number | null;
};

/**
 * An in-memory Kv for tests, with a clock the test moves. `failing` makes
 * every command throw, like an unreachable Upstash; `failOn` makes only the
 * named commands throw. A transaction (hsetnxEx, incrEx, zaddTop) is one
 * command: it applies all of its parts or none.
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

  async zaddTop(
    key: string,
    member: string,
    score: number,
    keep: number,
    seconds: number,
  ): Promise<number | null> {
    this.run("zaddTop", key);
    const entry = this.live(key);
    const set: Sorted = (Array.isArray(entry?.value) ? entry.value : [])
      .filter((e) => e.member !== member)
      .concat({ member, score })
      .sort((a, b) =>
        a.score !== b.score
          ? a.score - b.score
          : a.member < b.member
            ? -1
            : a.member > b.member
              ? 1
              : 0,
      );
    // ZREMRANGEBYRANK 0 -(keep+1): drop the lowest, keep the best `keep`.
    const kept = set.slice(Math.max(0, set.length - keep));
    this.entries.set(key, {
      value: kept,
      expiresAt: this.nowMs + seconds * 1000,
    });
    const at = kept.findIndex((e) => e.member === member);
    return at === -1 ? null : kept.length - 1 - at;
  }

  async ztop(
    key: string,
    n: number,
  ): Promise<{ member: string; score: number }[]> {
    this.run("ztop", key);
    const entry = this.live(key);
    if (!Array.isArray(entry?.value)) return [];
    return entry.value
      .slice()
      .reverse()
      .slice(0, n)
      .map((e) => ({ ...e }));
  }

  async del(key: string): Promise<void> {
    this.run("del", key);
    this.entries.delete(key);
  }
}
