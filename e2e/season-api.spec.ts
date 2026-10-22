import { expect, test, type APIRequestContext } from "@playwright/test";

// The 30–0 API on the built server, Redis off (E2E_ENV): a scripted draft of
// eleven and its season, a forged token refused, the board off and cached
// 30 s at the CDN, and the shared code played again to the same record.

type Draft = {
  status: "drafting" | "complete";
  token: string;
  spin?: { candidates: { id: string }[] };
};

type Played = {
  day: string;
  code: string;
  season: {
    w: number;
    d: number;
    l: number;
    points: number;
    matches: unknown[];
  };
};

const draft = async (request: APIRequestContext, data: object) =>
  (await (await request.post("/api/season/draft", { data })).json()) as Draft;

/** Drafts eleven, first candidate each time; the complete token. */
async function draftEleven(request: APIRequestContext): Promise<string> {
  let r = await draft(request, { action: "start" });
  while (r.status === "drafting")
    r = await draft(request, {
      action: "pick",
      token: r.token,
      pick: r.spin!.candidates[0].id,
    });
  expect(r.status).toBe("complete");
  return r.token;
}

test("a scripted draft of 11 then a play returns a season; no set-cookie with Redis off", async ({
  request,
}) => {
  const token = await draftEleven(request);
  const play = await request.post("/api/season/play", { data: { token } });
  expect(play.status()).toBe(200);
  expect(play.headers()["set-cookie"]).toBeUndefined();
  const body = (await play.json()) as Played & { store: string };
  expect(body.season.matches).toHaveLength(30);
  expect(body.season.w + body.season.d + body.season.l).toBe(30);
  expect(body.store).toBe("device");
});

test("a squad that was not drafted cannot be played", async ({ request }) => {
  const play = await request.post("/api/season/play", {
    data: { token: "v1.eyJpZCI6IngifQ.AAAA" },
  });
  expect(play.status()).toBe(403);
  expect(play.headers()["set-cookie"]).toBeUndefined();
});

test("the board answers status off with s-maxage=30", async ({ request }) => {
  const board = await request.get("/api/season/board");
  expect(board.status()).toBe(200);
  // A force-dynamic GET keeps its own public Cache-Control, as Next serves it.
  expect(board.headers()["cache-control"]).toBe(
    "public, s-maxage=30, stale-while-revalidate=30",
  );
  expect(board.headers()["set-cookie"]).toBeUndefined();
  expect(await board.json()).toMatchObject({ status: "off", rows: [] });
});

test("the replay of the played squad gives the same record", async ({
  request,
}) => {
  const token = await draftEleven(request);
  const played = (await (
    await request.post("/api/season/play", { data: { token } })
  ).json()) as Played;
  const replay = await request.get("/api/season/replay", {
    params: { d: played.day, xi: played.code },
  });
  expect(replay.status()).toBe(200);
  const again = (await replay.json()) as Played;
  expect(again.code).toBe(played.code);
  expect(again.day).toBe(played.day);
  expect(again.season).toEqual(played.season);

  // The same squad written in another order within a line is not its code.
  const codes = played.code.split("~");
  [codes[1], codes[2]] = [codes[2], codes[1]];
  const reordered = await request.get("/api/season/replay", {
    params: { d: played.day, xi: codes.join("~") },
  });
  expect(reordered.status()).toBe(400);
});
