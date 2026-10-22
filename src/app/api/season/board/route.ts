import { toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { handleBoard } from "@/season/board";
import { getSeasonData } from "@/season/data.server";

// GET /api/season/board (D-S3-10): today's top sides, played again on the
// server. The work is in src/season/board.ts. The route is dynamic (the
// board changes through the day); its answer carries its own public
// Cache-Control, so the CDN keeps it 30 s. Errors stay private.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await handleBoard({
      now: new Date(),
      data: await getSeasonData(),
      kv: getKv(),
      env: kvEnv(),
    });
    return toResponse(result);
  } catch {
    console.error("season: a board request could not be answered");
    return toResponse({ status: 503, body: { error: "closed" } });
  }
}
