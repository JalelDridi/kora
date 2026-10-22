import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { toResponse } from "@/chkoun/http";
import { cardLines } from "@/season/card";
import { getSeasonData } from "@/season/data.server";
import { handleReplay, REPLAY_CACHE } from "@/season/replay";
import type { SeasonView } from "@/season/replay";
import { shareImageSize } from "@/share";

// GET /api/season/card?d=&xi=&l= (plan Task 17, T-S3-14): a shared season's
// link preview, a text-only card drawn by next/og. Latin-only in every
// locale (src/season/card.ts): Satori cannot shape Arabic. `l` is the
// sharer's locale slug, unused by the layout today. The season comes from
// handleReplay, so the same squad on the same day is the same card: public
// and cached a day at the CDN. Anything handleReplay refuses is a private
// 404 with no image. The font is Inter 600, latin subset, read from
// @fontsource/inter at the first request (traced by next.config.ts).

export const dynamic = "force-dynamic";

const FONT = path.join(
  process.cwd(),
  "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff",
);

let font: Promise<Buffer> | undefined;
const loadFont = () =>
  (font ??= readFile(FONT).catch((error: unknown) => {
    font = undefined;
    throw error;
  }));

const PITCH = "#0b1510";
const PITCH_LINE = "#284334";
const MINT = "#9ad4b4";
const CHALK = "#eef3ef";
const CHALK_DIM = "#cfd8d2";

function Card({ view }: { view: SeasonView }) {
  const card = cardLines(view);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: PITCH,
        color: CHALK,
        fontFamily: "Inter",
        padding: 56,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 430,
          paddingRight: 40,
          borderRight: `2px solid ${PITCH_LINE}`,
        }}
      >
        <div style={{ display: "flex", fontSize: 44, color: MINT }}>
          {card.header}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1 }}>
            {card.record}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              color: CHALK_DIM,
              marginTop: 24,
            }}
          >
            {card.points}
          </div>
          <div style={{ display: "flex", fontSize: 40, color: CHALK_DIM }}>
            {card.rating}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // The card's width less its padding and the left column: the
          // names wrap within it, one name never split.
          width: shareImageSize.width - 2 * 56 - 430,
          paddingLeft: 40,
        }}
      >
        {card.lines.map((line) => (
          <div
            key={line.label}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", fontSize: 24, color: MINT }}>
              {line.label}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontSize: 28,
                lineHeight: 1.3,
              }}
            >
              {line.names.map((name, i) => (
                <div
                  key={i}
                  style={{ display: "flex", marginRight: 28, flexShrink: 0 }}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let view: SeasonView;
  let data: Buffer;
  try {
    const result = handleReplay(
      { now: new Date(), data: await getSeasonData() },
      { d: params.get("d"), xi: params.get("xi") },
    );
    if (result.status !== 200)
      return toResponse({ status: 404, body: { error: "notFound" } });
    view = result.body as SeasonView;
    data = await loadFont();
  } catch {
    console.error("season: a squad card could not be drawn");
    return toResponse({ status: 503, body: { error: "closed" } });
  }
  // The PNG is drawn as the response streams, after this returns.
  return new ImageResponse(<Card view={view} />, {
    ...shareImageSize,
    fonts: [{ name: "Inter", data, weight: 600, style: "normal" }],
    headers: { "Cache-Control": REPLAY_CACHE },
  });
}
