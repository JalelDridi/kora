import { getDb } from "@/db/client";
import { checkRedis, getRedis } from "@/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unreachable" = "ok";
  try {
    await getDb().$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  const redis = await checkRedis(getRedis());

  // Redis being off is a configuration, not a fault.
  const healthy = database === "ok" && redis !== "unreachable";

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      redis,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
