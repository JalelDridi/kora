import { getFootballers } from "@/chkoun/attributes.server";
import { toResponse } from "@/chkoun/http";
import { getKv, kvEnv } from "@/chkoun/kv";
import { todayPuzzle } from "@/chkoun/puzzle.server";
import { handleToday } from "@/chkoun/today";

// GET /api/chkoun/today (plan Task 9): today's number, when it ends, and the
// visitor's own finished game when the server holds it. Never cached: the
// answer is in the response only for a visitor who has finished.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await handleToday(
      {
        now: new Date(),
        puzzle: todayPuzzle,
        footballers: await getFootballers(),
        kv: getKv(),
        env: kvEnv(),
      },
      request.headers.get("cookie"),
    );
    return toResponse(result);
  } catch {
    console.error("chkoun: today could not be answered");
    return toResponse({ status: 503, body: { status: "closed" } });
  }
}
