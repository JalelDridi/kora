import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commonsUrl, parseCommons, stripHtml } from "./commons.ts";

const page = (
  title: string,
  extmetadata: Record<string, { value: string }>,
) => ({
  title,
  imageinfo: [
    {
      thumburl: "https://upload.wikimedia.org/thumb/400px-x.jpg",
      width: 1200,
      height: 900,
      descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, "_")}`,
      extmetadata,
    },
  ],
});

describe("parseCommons", () => {
  it("keeps the credit a reuser must show, with the HTML stripped", () => {
    const photos = parseCommons({
      query: {
        pages: [
          page("File:Wahbi Khazri.jpg", {
            LicenseShortName: { value: "CC BY-SA 4.0" },
            LicenseUrl: {
              value: "https://creativecommons.org/licenses/by-sa/4.0",
            },
            Artist: {
              value:
                '<a href="//commons.wikimedia.org/wiki/User:X">azrael74</a> from Berlin',
            },
            AttributionRequired: { value: "true" },
          }),
        ],
      },
    });

    expect(photos.get("File:Wahbi Khazri.jpg")).toEqual({
      file: "File:Wahbi Khazri.jpg",
      thumbUrl: "https://upload.wikimedia.org/thumb/400px-x.jpg",
      width: 1200,
      height: 900,
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      author: "azrael74 from Berlin",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wahbi_Khazri.jpg",
      attributionRequired: true,
    });
  });

  it("drops a file with no licence and a missing file", () => {
    const photos = parseCommons({
      query: {
        pages: [
          page("File:No licence.jpg", {}),
          { title: "File:Gone.jpg", missing: true },
        ],
      },
    });
    expect(photos.size).toBe(0);
  });

  it("marks public-domain files as needing no attribution", () => {
    const photos = parseCommons({
      query: {
        pages: [
          page("File:Old.jpg", {
            LicenseShortName: { value: "Public domain" },
            AttributionRequired: { value: "false" },
          }),
        ],
      },
    });
    expect(photos.get("File:Old.jpg")?.attributionRequired).toBe(false);
    expect(photos.get("File:Old.jpg")?.author).toBeNull();
  });

  it("parses the recorded response", () => {
    const json = JSON.parse(
      readFileSync("src/pipeline/__fixtures__/commons.json", "utf8"),
    );
    const photos = [...parseCommons(json).values()];

    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(photo.licence).not.toBe("");
      expect(photo.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(photo.author ?? "").not.toMatch(/[<>]/);
    }
  });
});

describe("commonsUrl and stripHtml", () => {
  it("asks for 50 files' licences and a 400 px thumbnail", () => {
    const url = new URL(commonsUrl(["File:A.jpg", "File:B.jpg"]));
    expect(url.host).toBe("commons.wikimedia.org");
    expect(url.searchParams.get("titles")).toBe("File:A.jpg|File:B.jpg");
    expect(url.searchParams.get("iiurlwidth")).toBe("400");
    expect(url.searchParams.get("maxlag")).toBe("5");
  });

  it("removes tags and decodes the common entities", () => {
    expect(stripHtml("<span>A &amp; B</span>&nbsp; <b>C</b>")).toBe("A & B C");
  });
});
