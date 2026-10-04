import { Redis } from "@upstash/redis";

export type RedisState = "ok" | "unreachable" | "off";

// Null when Upstash is not configured (local runs, CI). Features that need
// Redis switch themselves off instead of failing.
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function checkRedis(
  redis: { ping(): Promise<string> } | null,
): Promise<RedisState> {
  if (!redis) return "off";
  try {
    return (await redis.ping()) === "PONG" ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
