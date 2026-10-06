// Decision P30: a standard Commons thumbnail (330 px wide) per footballer,
// copied into public/photos/ by the nightly job, served as a static file next
// to its credit; no hotlinking, no crop, no re-encoding, so the credit needs
// no "modified" note. A photo is copied only with its licence, its file page
// and, when the licence asks for attribution, its author.

import {
  HttpError,
  retryDelayMs,
  StoppedError,
  THROTTLE_WAIT_MS,
  USER_AGENT,
} from "./http.ts";
import type { FetchLike } from "./http.ts";
import type { Photo } from "./types.ts";

/** A 330 px thumbnail is about 20 to 60 KB; anything much larger is not one. */
export const MAX_PHOTO_BYTES = 120 * 1024;

const TYPES: Record<string, "jpg" | "png"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** P49: a copy is fetched again only when the Commons file name changes. */
export function sameCommonsFile(a: Photo, b: Photo): boolean {
  return a.file === b.file;
}

/** Why a photo cannot be copied at all, or null when it can. */
export function creditGap(photo: Photo): string | null {
  if (!photo.licence || !photo.sourceUrl || !photo.file)
    return "no licence or file page";
  if (photo.attributionRequired && !photo.author)
    return "the licence asks for an author and Commons names none";
  return null;
}

/** The next standard thumbnail width below 330 px (Wikimedia's standard steps). */
export const SMALLER_WIDTH = 250;

/**
 * The URL of the same Commons file as a 250 px standard thumbnail, for a
 * copy that came back over MAX_PHOTO_BYTES; null when the file is not wider
 * than that or the URL has an unknown shape. Commons answers a 330 px request
 * for a narrower file with the original ("thumbnail_unscaled"), which can be
 * an unoptimised file of 150 to 240 KB; a 250 px thumbnail is a re-scaled one.
 * The shape (thumb.wikimedia.org/…/thumb/<a>/<ab>/<name>/250px-<name>) is the
 * one the 330 px URLs have; unverified for the unscaled files until a run.
 */
export function smallerThumbUrl(photo: Photo): string | null {
  if (photo.width <= SMALLER_WIDTH) return null;
  const url = photo.thumbUrl;
  const scaled = /\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/?]+\/\d+px-[^/?]+/;
  if (scaled.test(url)) return url.replace(/\/\d+px-/, `/${SMALLER_WIDTH}px-`);
  const original = url.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/?]+)(\?.*)?$/,
  );
  if (!original) return null;
  const [, dirs, name] = original;
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${dirs}/${name}/${SMALLER_WIDTH}px-${name}`;
}

export type PhotoPlayer = { id: string; photo: Photo | null };

export type PhotoSync = {
  /** The path each footballer's photo is served at, or null (silhouette). */
  paths: Map<string, string | null>;
  /**
   * Footballers whose Commons file was renamed but not copied again this run:
   * the old copy, still on disk, stays with its own credit until the new one
   * is downloaded (review 1, L7). The pool takes this photo, not the new one.
   */
  kept: Map<string, Photo>;
  /** Thumbnails downloaded this run. */
  downloaded: number;
  /** Footballers whose photo waits for a later run (budget spent). */
  waiting: number;
  /** One line per photo not copied, for the report. */
  notes: string[];
};

/**
 * Copies the thumbnails that are new, then those whose Commons file name
 * changed, at most `max` downloads, one at a time, `gapMs` apart. A photo already copied from
 * the same Commons file keeps its path while its file is still there; a
 * renamed one keeps its old copy and credit until the new one is copied. A
 * copy over MAX_PHOTO_BYTES is asked again once as a 250 px thumbnail.
 * `exists(name)` and `write(name, bytes)` work in public/photos/. A 429 or
 * 403 stops the downloads for the run, like the other clients.
 */
export async function syncPhotos(input: {
  players: PhotoPlayer[];
  /** Last build's photos, by footballer. */
  previous: Map<string, Photo | null>;
  max: number;
  fetch: FetchLike;
  exists: (name: string) => Promise<boolean>;
  write: (name: string, bytes: Uint8Array) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
  offline?: boolean;
  /** 429s waited out (Retry-After, else 60 s) before the downloads stop. */
  throttleWaits?: number;
}): Promise<PhotoSync> {
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: PhotoSync = {
    paths: new Map(),
    kept: new Map(),
    downloaded: 0,
    waiting: 0,
    notes: [],
  };
  // First every footballer's place: no photo, kept, or to download. New
  // copies go before re-fetches of a renamed Commons file (P49).
  const fresh: { id: string; photo: Photo }[] = [];
  const renamed: { id: string; photo: Photo }[] = [];
  /** The old copy of a renamed file, used until the new one is copied. */
  const keep = (id: string) => {
    const before = input.previous.get(id);
    if (!before?.path || !renamed.some((r) => r.id === id)) return;
    out.paths.set(id, before.path);
    out.kept.set(id, before);
  };
  for (const { id, photo } of input.players) {
    out.paths.set(id, null);
    if (photo === null) continue;
    const gap = creditGap(photo);
    if (gap) {
      out.notes.push(`${id}: not copied, ${gap}`);
      continue;
    }
    const before = input.previous.get(id);
    const copied =
      before?.path != null &&
      (await input.exists(before.path.replace(/^\/photos\//, "")));
    if (copied && sameCommonsFile(before!, photo)) {
      out.paths.set(id, before!.path!);
      continue;
    }
    (copied ? renamed : fresh).push({ id, photo });
  }
  let stopped: string | null = null;
  let first = true;
  let throttled = 0;
  const headers = { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT };
  /** One request, a 429 waited out (Retry-After, else 60 s) up to the run's limit. */
  const get = async (url: string): Promise<Response> => {
    if (!first) await sleep(input.gapMs ?? 250);
    first = false;
    let response = await input.fetch(url, { headers });
    // A 429 from thumb.wikimedia.org is a throttle: wait and ask again.
    while (response.status === 429 && throttled < (input.throttleWaits ?? 3)) {
      throttled++;
      const header = response.headers.get("retry-after");
      await response.body?.cancel();
      await sleep(
        header === null
          ? THROTTLE_WAIT_MS
          : Math.min(retryDelayMs(header, 0, Date.now()), 300_000),
      );
      response = await input.fetch(url, { headers });
    }
    out.downloaded++;
    if (response.status === 429 || response.status === 403) {
      await response.body?.cancel();
      throw new StoppedError(url, response.status);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(url, response.status);
    }
    return response;
  };
  type Copy =
    | { bytes: Uint8Array; ext: "jpg" | "png" }
    | { over: number }
    | { type: string };
  /** The bytes and extension, or why not: over the size limit, or the type. */
  const copy = async (url: string): Promise<Copy> => {
    const response = await get(url);
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const ext = TYPES[type];
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (!ext || declared > MAX_PHOTO_BYTES) {
      await response.body?.cancel();
      return ext ? { over: declared } : { type };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PHOTO_BYTES) return { over: bytes.byteLength };
    return { bytes, ext };
  };
  for (const { id, photo } of [...fresh, ...renamed]) {
    if (input.offline || stopped || out.downloaded >= input.max) {
      out.waiting++;
      keep(id);
      continue;
    }
    try {
      let result = await copy(photo.thumbUrl);
      // Over the limit: the next standard width down, once (the eleven
      // "not copied" of the first runs were mostly unscaled originals).
      const smaller = smallerThumbUrl(photo);
      if ("over" in result && smaller && out.downloaded < input.max)
        result = await copy(smaller);
      if (!("bytes" in result)) {
        out.paths.set(id, null);
        out.notes.push(
          `${id}: not copied, ${"over" in result ? `${result.over} bytes, over ${MAX_PHOTO_BYTES}` : `type "${result.type || "none"}"`}`,
        );
        keep(id);
        continue;
      }
      await input.write(`${id}.${result.ext}`, result.bytes);
      out.paths.set(id, `/photos/${id}.${result.ext}`);
    } catch (error) {
      out.paths.set(id, null);
      const message = error instanceof Error ? error.message : String(error);
      out.notes.push(`${id}: not copied, ${message}`);
      if (error instanceof StoppedError) stopped = message;
      keep(id);
    }
  }
  return out;
}
