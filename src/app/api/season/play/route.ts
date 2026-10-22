import { clientIp, readCapped, toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { getSeasonData } from "@/season/data.server";
import { MAX_DRAFT_BODY_BYTES } from "@/season/draft";
import { handlePlay } from "@/season/play";

// POST /api/season/play (D-S3-9, D-S3-11): a complete draft token in, its
// season out, simulated on the server. The work is in src/season/play.ts;
// this file only connects it to the request. Never cached. Errors are
// logged without an id, a token or the seed.

export const dynamic = "force-dynamic";

const closed = () => toResponse({ status: 503, body: { error: "closed" } });

export async function POST(request: Request) {
  const seed = process.env.CHKOUN_SEED;
  if (!seed) return closed();
  const body = await readCapped(request, MAX_DRAFT_BODY_BYTES).catch(
    () => null,
  );
  if (body === null)
    return toResponse({ status: 400, body: { error: "badRequest" } });
  try {
    const result = await handlePlay(
      {
        now: new Date(),
        data: await getSeasonData(),
        kv: getKv(),
        seed,
        env: kvEnv(),
        secureCookie: process.env.NODE_ENV === "production",
      },
      body,
      { cookie: request.headers.get("cookie"), ip: clientIp(request.headers) },
    );
    return toResponse(result);
  } catch {
    console.error("season: a play request could not be answered");
    return closed();
  }
}
