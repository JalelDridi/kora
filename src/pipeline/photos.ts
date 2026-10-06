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

export type PhotoPlayer = { id: string; photo: Photo | null };

export type PhotoSync = {
  /** The path each footballer's photo is served at, or null (silhouette). */
  paths: Map<string, string | null>;
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
 * the same Commons file keeps its path while its file is still there.
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
    downloaded: 0,
    waiting: 0,
    notes: [],
  };
  // First every footballer's place: no photo, kept, or to download. New
  // copies go before re-fetches of a renamed Commons file (P49).
  const fresh: { id: string; photo: Photo }[] = [];
  const renamed: { id: string; photo: Photo }[] = [];
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
  for (const { id, photo } of [...fresh, ...renamed]) {
    if (input.offline || stopped || out.downloaded >= input.max) {
      out.waiting++;
      continue;
    }
    if (!first) await sleep(input.gapMs ?? 250);
    first = false;
    try {
      let response = await input.fetch(photo.thumbUrl, {
        headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      });
      // A 429 from thumb.wikimedia.org is a throttle: wait and ask again.
      while (
        response.status === 429 &&
        throttled < (input.throttleWaits ?? 3)
      ) {
        throttled++;
        const header = response.headers.get("retry-after");
        await response.body?.cancel();
        await sleep(
          header === null
            ? THROTTLE_WAIT_MS
            : Math.min(retryDelayMs(header, 0, Date.now()), 300_000),
        );
        response = await input.fetch(photo.thumbUrl, {
          headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
        });
      }
      out.downloaded++;
      if (response.status === 429 || response.status === 403) {
        await response.body?.cancel();
        throw new StoppedError(photo.thumbUrl, response.status);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpError(photo.thumbUrl, response.status);
      }
      const type = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const ext = TYPES[type];
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (!ext || declared > MAX_PHOTO_BYTES) {
        await response.body?.cancel();
        out.paths.set(id, null);
        out.notes.push(
          `${id}: not copied, ${ext ? `${declared} bytes, over ${MAX_PHOTO_BYTES}` : `type "${type || "none"}"`}`,
        );
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_PHOTO_BYTES) {
        out.paths.set(id, null);
        out.notes.push(
          `${id}: not copied, ${bytes.byteLength} bytes, over ${MAX_PHOTO_BYTES}`,
        );
        continue;
      }
      await input.write(`${id}.${ext}`, bytes);
      out.paths.set(id, `/photos/${id}.${ext}`);
    } catch (error) {
      out.paths.set(id, null);
      const message = error instanceof Error ? error.message : String(error);
      out.notes.push(`${id}: not copied, ${message}`);
      if (error instanceof StoppedError) stopped = message;
    }
  }
  return out;
}
