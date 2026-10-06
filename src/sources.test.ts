import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Photo, Pool, PoolPlayer } from "./pipeline/types";
import { photoCredits } from "./sources";

const photo = (id: string, extra: Partial<Photo> = {}): Photo => ({
  file: `File:${id}.jpg`,
  thumbUrl: `https://upload.wikimedia.org/${id}.jpg`,
  width: 330,
  height: 440,
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  author: `Author of ${id}`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  attributionRequired: true,
  path: `/photos/${id}.jpg`,
  ...extra,
});

const player = (id: string, nameLatin: string, p: Photo | null): PoolPlayer =>
  ({
    id,
    nameLatin,
    nameArabic: null,
    nameFrench: null,
    photo: p,
    pools: { active: true, legend: false },
  }) as PoolPlayer;

const pool = {
  players: [
    player("zed", "Zied Zed", photo("zed")),
    player("amine", "Amine Abdi", photo("amine")),
    player("no-path", "Bilel Bad", photo("no-path", { path: null })),
    player("old-pool", "Chiheb Old", photo("old-pool", { path: undefined })),
    player("none", "Dali None", null),
  ],
} as unknown as Pool;

describe("photo credits", () => {
  it("every footballer with a stored photo has one row: name, author, licence with link, file page, changes 'none'", () => {
    const rows = photoCredits(pool);
    expect(rows.map((r) => r.id)).toEqual(["amine", "zed"]);
    expect(rows[0]).toEqual({
      id: "amine",
      nameLatin: "Amine Abdi",
      nameArabic: null,
      nameFrench: null,
      author: "Author of amine",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      file: "File:amine.jpg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:amine.jpg",
      changes: "none",
    });
  });

  it("rows are sorted by Latin name", () => {
    const names = photoCredits(pool).map((r) => r.nameLatin);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("covers every copied photo of the committed pool", () => {
    const real = JSON.parse(
      readFileSync(new URL("../data/pool.json", import.meta.url), "utf8"),
    ) as Pool;
    const stored = real.players.filter((p) => p.photo?.path).map((p) => p.id);
    expect(
      photoCredits(real)
        .map((r) => r.id)
        .sort(),
    ).toEqual(stored.sort());
  });
});
