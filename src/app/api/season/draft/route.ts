import { clientIp, readCapped, toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { getSeasonData } from "@/season/data.server";
import { handleDraft, MAX_DRAFT_BODY_BYTES } from "@/season/draft";

// POST /api/season/draft (D-S3-4, D-S3-14): start a 30–0 draft, pick, or
// re-spin once. The work is in src/season/draft.ts; this file only connects
// it to the request. Never cached. Errors are logged without an id, a token
// or the seed.

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
    const result = await handleDraft(
      {
        now: new Date(),
        data: await getSeasonData(),
        kv: getKv(),
        seed,
        env: kvEnv(),
        secureCookie: process.env.NODE_ENV === "production",
      },
      body,
      { ip: clientIp(request.headers) },
    );
    return toResponse(result);
  } catch {
    console.error("season: a draft request could not be answered");
    return closed();
  }
}
