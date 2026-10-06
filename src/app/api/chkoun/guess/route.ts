import { getFootballers } from "@/chkoun/attributes.server";
import { handleGuess, MAX_BODY_BYTES } from "@/chkoun/guess";
import { clientIp, readCapped, toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { todayPuzzle } from "@/chkoun/puzzle.server";

// POST /api/chkoun/guess (plan Task 9): one guess against today's footballer.
// The work is in src/chkoun/guess.ts; this file only connects it to the
// request. Never cached. Errors are logged without a footballer or the seed.

export const dynamic = "force-dynamic";

const closed = () => toResponse({ status: 503, body: { error: "closed" } });

export async function POST(request: Request) {
  const seed = process.env.CHKOUN_SEED;
  if (!seed) return closed();
  const body = await readCapped(request, MAX_BODY_BYTES).catch(() => null);
  if (body === null)
    return toResponse({ status: 400, body: { error: "badRequest" } });
  try {
    const result = await handleGuess(
      {
        now: new Date(),
        puzzle: todayPuzzle,
        footballers: await getFootballers(),
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
    console.error("chkoun: a guess could not be answered");
    return closed();
  }
}
