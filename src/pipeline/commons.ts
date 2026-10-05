import type { Photo } from "./types.ts";

/** One request for up to 50 files: licence, author, size, a 330 px thumbnail (P30). */
export function commonsUrl(files: string[]): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata|size|url",
    iiurlwidth: "330",
    iiextmetadatafilter:
      "LicenseShortName|LicenseUrl|Artist|AttributionRequired",
    maxlag: "5",
    titles: files.join("|"),
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Commons' Artist field is HTML (127 of 151 had links in the probe). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (_, name: string) => ENTITIES[name],
    )
    .replace(/\s+/g, " ")
    .trim();
}

type Meta = Record<string, { value?: unknown } | undefined>;
type ImageInfo = {
  thumburl?: string;
  width?: number;
  height?: number;
  descriptionurl?: string;
  extmetadata?: Meta;
};
type CommonsPage = {
  title?: string;
  missing?: boolean;
  imageinfo?: ImageInfo[];
};

function metaText(entry: { value?: unknown } | undefined): string | null {
  const value = entry?.value;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Photos keyed by file title ("File:Name.jpg"). Files without a licence are
 * dropped. An error body (HTTP 200 with a top-level `error`, maxlag included)
 * throws, so it is never taken for "no photos".
 */
export function parseCommons(json: unknown): Map<string, Photo> {
  const error = (json as { error?: { code?: string; info?: string } } | null)
    ?.error;
  if (error) throw new Error(`MediaWiki error ${error.code}: ${error.info}`);
  const pages =
    (json as { query?: { pages?: CommonsPage[] } } | null)?.query?.pages ?? [];
  const photos = new Map<string, Photo>();
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const licence = metaText(meta.LicenseShortName);
    if (
      !page.title ||
      page.missing ||
      !info?.thumburl ||
      !info.descriptionurl ||
      !licence
    ) {
      continue;
    }
    const artist = metaText(meta.Artist);
    photos.set(page.title, {
      file: page.title,
      thumbUrl: info.thumburl,
      width: info.width ?? 0,
      height: info.height ?? 0,
      licence,
      licenceUrl: metaText(meta.LicenseUrl),
      author: artist ? stripHtml(artist) || null : null,
      sourceUrl: info.descriptionurl,
      attributionRequired: metaText(meta.AttributionRequired) !== "false",
    });
  }
  return photos;
}
