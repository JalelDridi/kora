import { toResponse } from "@/chkoun/http";
import { getSeasonData } from "@/season/data.server";
import { handleReplay } from "@/season/replay";

// GET /api/season/replay?d=&xi= (D-S3-9): a shared season, played again on
// the server. The work is in src/season/replay.ts. The route is dynamic (it
// reads the query); a season's answer carries its own public Cache-Control,
// so the CDN keeps it a day. Errors stay private.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const result = handleReplay(
      { now: new Date(), data: await getSeasonData() },
      { d: params.get("d"), xi: params.get("xi") },
    );
    return toResponse(result);
  } catch {
    console.error("season: a replay request could not be answered");
    return toResponse({ status: 503, body: { error: "closed" } });
  }
}
