import { describe, expect, it } from "vitest";
import { USER_AGENT } from "./http.ts";
import { MAX_PHOTO_BYTES, syncPhotos } from "./photos.ts";
import type { Photo } from "./types.ts";

const photo: Photo = {
  file: "File:Wahbi Khazri 2018.jpg",
  thumbUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wahbi_Khazri_2018.jpg/330px-Wahbi_Khazri_2018.jpg",
  width: 2000,
  height: 3000,
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  author: "Someone",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Wahbi_Khazri_2018.jpg",
  attributionRequired: true,
};

const jpeg = (size = 30_000, type = "image/jpeg") =>
  new Response(new Uint8Array(size), {
    status: 200,
    headers: { "content-type": type },
  });

/** A fake public/photos/ and a fake fetch that records what it was asked. */
function world(answer: (url: string) => Response = () => jpeg()) {
  const files = new Map<string, Uint8Array>();
  const asked: { url: string; agent: string | null }[] = [];
  return {
    files,
    asked,
    deps: {
      fetch: async (url: string, init?: RequestInit) => {
        asked.push({
          url,
          agent: new Headers(init?.headers).get("user-agent"),
        });
        return answer(url);
      },
      exists: async (name: string) => files.has(name),
      write: async (name: string, bytes: Uint8Array) => {
        files.set(name, bytes);
      },
      sleep: async () => {},
    },
  };
}

const khazri = { id: "wahbi-khazri", photo };

describe("syncPhotos (P30)", () => {
  it("downloads the thumbnail when the file is new", async () => {
    const w = world();
    const out = await syncPhotos({
      players: [khazri, { id: "no-photo", photo: null }],
      previous: new Map(),
      max: 10,
      ...w.deps,
    });
    expect(out.paths).toEqual(
      new Map([
        ["wahbi-khazri", "/photos/wahbi-khazri.jpg"],
        ["no-photo", null],
      ]),
    );
    expect([...w.files.keys()]).toEqual(["wahbi-khazri.jpg"]);
    expect(out.downloaded).toBe(1);
  });

  it("downloads it again when the Commons file changed", async () => {
    const w = world();
    w.files.set("wahbi-khazri.jpg", new Uint8Array(1));
    const before = {
      ...photo,
      file: "File:Wahbi Khazri 2015.jpg",
      path: "/photos/wahbi-khazri.jpg",
    };
    await syncPhotos({
      players: [khazri],
      previous: new Map([["wahbi-khazri", before]]),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toHaveLength(1);
    expect(w.files.get("wahbi-khazri.jpg")?.byteLength).toBe(30_000);
  });

  it("does not fetch again for the same file name, whatever its size (P49)", async () => {
    const w = world();
    w.files.set("wahbi-khazri.jpg", new Uint8Array(1));
    await syncPhotos({
      players: [{ id: "wahbi-khazri", photo: { ...photo, width: 999 } }],
      previous: new Map([
        ["wahbi-khazri", { ...photo, path: "/photos/wahbi-khazri.jpg" }],
      ]),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toEqual([]);
  });

  it("downloads new files before re-fetching renamed ones (P49)", async () => {
    const w = world();
    w.files.set("renamed.jpg", new Uint8Array(1));
    const out = await syncPhotos({
      players: [
        { id: "renamed", photo: { ...photo, thumbUrl: "https://x/renamed" } },
        { id: "new", photo: { ...photo, thumbUrl: "https://x/new" } },
      ],
      previous: new Map([
        [
          "renamed",
          { ...photo, file: "File:Old.jpg", path: "/photos/renamed.jpg" },
        ],
      ]),
      max: 1,
      ...w.deps,
    });
    expect(w.asked.map((a) => a.url)).toEqual(["https://x/new"]);
    expect(out.waiting).toBe(1);
  });

  it("skips it when the stored file is the same Commons file", async () => {
    const w = world();
    w.files.set("wahbi-khazri.jpg", new Uint8Array(1));
    const out = await syncPhotos({
      players: [khazri],
      previous: new Map([
        ["wahbi-khazri", { ...photo, path: "/photos/wahbi-khazri.jpg" }],
      ]),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toEqual([]);
    expect(out.paths.get("wahbi-khazri")).toBe("/photos/wahbi-khazri.jpg");
  });

  it("downloads again a file that went missing from public/photos", async () => {
    const w = world();
    await syncPhotos({
      players: [khazri],
      previous: new Map([
        ["wahbi-khazri", { ...photo, path: "/photos/wahbi-khazri.jpg" }],
      ]),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toHaveLength(1);
  });

  it("sends the pipeline User-Agent", async () => {
    const w = world();
    await syncPhotos({
      players: [khazri],
      previous: new Map(),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toEqual([{ url: photo.thumbUrl, agent: USER_AGENT }]);
  });

  it("refuses a response that is not image/jpeg or image/png, or larger than 120 KB", async () => {
    for (const response of [
      () => jpeg(1000, "text/html"),
      () => jpeg(1000, "image/webp"),
      () => jpeg(MAX_PHOTO_BYTES + 1),
      () =>
        new Response(new Uint8Array(10), {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(MAX_PHOTO_BYTES + 1),
          },
        }),
      () => new Response("gone", { status: 404 }),
    ]) {
      const w = world(response);
      const out = await syncPhotos({
        players: [khazri],
        previous: new Map(),
        max: 10,
        ...w.deps,
      });
      expect(out.paths.get("wahbi-khazri")).toBeNull();
      expect(w.files.size).toBe(0);
      expect(out.notes).toHaveLength(1);
      expect(out.notes[0]).toMatch(/^wahbi-khazri: not copied, /);
    }
  });

  it("never writes a photo without author, licence and source page", async () => {
    const w = world();
    const out = await syncPhotos({
      players: [
        { id: "no-author", photo: { ...photo, author: null } },
        { id: "no-licence", photo: { ...photo, licence: "" } },
        { id: "no-page", photo: { ...photo, sourceUrl: "" } },
        // Public domain: no attribution asked, so no author is needed.
        {
          id: "public-domain",
          photo: { ...photo, author: null, attributionRequired: false },
        },
      ],
      previous: new Map(),
      max: 10,
      ...w.deps,
    });
    expect([...w.files.keys()]).toEqual(["public-domain.jpg"]);
    expect(out.notes).toEqual([
      "no-author: not copied, the licence asks for an author and Commons names none",
      "no-licence: not copied, no licence or file page",
      "no-page: not copied, no licence or file page",
    ]);
  });

  it("writes the extension from the content type", async () => {
    const w = world(() => jpeg(1000, "image/png; charset=binary"));
    const out = await syncPhotos({
      players: [khazri],
      previous: new Map(),
      max: 10,
      ...w.deps,
    });
    expect(out.paths.get("wahbi-khazri")).toBe("/photos/wahbi-khazri.png");
    expect([...w.files.keys()]).toEqual(["wahbi-khazri.png"]);
  });

  it("downloads at most `max`; the rest wait for a later run", async () => {
    const w = world();
    const out = await syncPhotos({
      players: ["a", "b", "c"].map((id) => ({ id, photo })),
      previous: new Map(),
      max: 2,
      ...w.deps,
    });
    expect(w.asked).toHaveLength(2);
    expect(out.paths.get("c")).toBeNull();
    expect(out.waiting).toBe(1);
  });

  it("stops at the first 429 and sends nothing more", async () => {
    const w = world(() => new Response("", { status: 429 }));
    const out = await syncPhotos({
      players: ["a", "b"].map((id) => ({ id, photo })),
      previous: new Map(),
      max: 10,
      ...w.deps,
    });
    expect(w.asked).toHaveLength(1);
    expect(out.paths).toEqual(
      new Map([
        ["a", null],
        ["b", null],
      ]),
    );
  });

  it("offline, downloads nothing and keeps the photos already copied", async () => {
    const w = world();
    w.files.set("a.jpg", new Uint8Array(1));
    const out = await syncPhotos({
      players: ["a", "b"].map((id) => ({ id, photo })),
      previous: new Map([["a", { ...photo, path: "/photos/a.jpg" }]]),
      max: 10,
      offline: true,
      ...w.deps,
    });
    expect(w.asked).toEqual([]);
    expect(out.paths).toEqual(
      new Map([
        ["a", "/photos/a.jpg"],
        ["b", null],
      ]),
    );
  });
});
