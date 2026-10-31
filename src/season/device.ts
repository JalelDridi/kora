import type { Day } from "@/engine/chkoun/types.ts";
import type { CandidateView, SpinView } from "./views.ts";

// What the visitor's own browser keeps of 30–0 (plan Task 10): the signed
// draft token with the draft endpoint's last answer, so a reload or a
// reopened in-app browser shows the same place without asking the server
// (the token alone cannot: the endpoint only starts, picks and re-spins),
// and the visitor's best ten seasons. Every access is wrapped: in-app
// browsers (Facebook, Instagram) may refuse or wipe storage, and the game
// goes on in memory.

export const DRAFT_KEY = "kora.season.v1.draft";
export const BEST_KEY = "kora.season.v1.best";
/** The season played last, whatever its points: the hub's line (M6). */
export const LAST_KEY = "kora.season.v1.last";
const BEST_KEPT = 10;

export type DeviceSeason = {
  day: Day;
  /** The canonical squad code. */
  xi: string;
  w: number;
  d: number;
  l: number;
  points: number;
  rating: number;
  /** The Ligue 1 club the squad played in place of. */
  replaces: string;
  /** When it was played (ISO). */
  at: string;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

function storage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function read(key: string, from: StorageLike | null = storage()): unknown {
  try {
    const text = from?.getItem(key) ?? null;
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or refused: the draft goes on in memory.
  }
}

/** The draft endpoint's answer (src/season/draft.ts), as the page shows it. */
export type DraftView = {
  token: string;
  squad: CandidateView[];
  respinLeft: boolean;
} & (
  | { status: "drafting"; spin: SpinView }
  | { status: "complete"; spin?: undefined }
);

type SavedDraft = { token: string; view: DraftView | null };

function readDraft(): SavedDraft | null {
  const v = read(DRAFT_KEY);
  if (typeof v !== "object" || v === null) return null;
  const { token, view } = v as Record<string, unknown>;
  if (typeof token !== "string" || token.length === 0) return null;
  // The view is only display: its token must be the one kept with it.
  const sameToken =
    typeof view === "object" &&
    view !== null &&
    (view as { token?: unknown }).token === token;
  return { token, view: sameToken ? (view as DraftView) : null };
}

/** Keeps the token, and the answer that came with it (one key: both or neither). */
export function saveDraft(token: string, view?: DraftView): void {
  write(DRAFT_KEY, { token, view: view ?? null } satisfies SavedDraft);
}

export function loadDraft(): string | null {
  return readDraft()?.token ?? null;
}

/** The last answer kept with the token; the caller checks its shape. */
export function loadDraftView(): unknown {
  return readDraft()?.view ?? null;
}

/**
 * Whether a kept draft view has a pick already: the first-visit help stays
 * shut over it (mobile polish M2). A draft just started has none.
 */
export function draftUnderWay(view: unknown): boolean {
  if (typeof view !== "object" || view === null) return false;
  const squad = (view as { squad?: unknown }).squad;
  return Array.isArray(squad) && squad.length > 0;
}

export function clearDraft(): void {
  try {
    const s = storage();
    if (s?.removeItem) s.removeItem(DRAFT_KEY);
    else s?.setItem(DRAFT_KEY, "null");
  } catch {
    // Refused: a stale token is refused by the server and replaced.
  }
}

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function isSeason(v: unknown): v is DeviceSeason {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.day === "string" &&
    typeof s.xi === "string" &&
    typeof s.replaces === "string" &&
    typeof s.at === "string" &&
    [s.w, s.d, s.l, s.points, s.rating].every(isNumber)
  );
}

/** The best seasons kept on this device, most points first (ties: earliest). */
export function bestSeasons(): DeviceSeason[] {
  const v = read(BEST_KEY);
  return Array.isArray(v) ? v.filter(isSeason).slice(0, BEST_KEPT) : [];
}

/** Kept once per squad and day (a replayed token gives the same season): the first entry stays. */
export function saveSeason(entry: DeviceSeason): void {
  const kept = bestSeasons();
  if (kept.some((s) => s.day === entry.day && s.xi === entry.xi)) return;
  const all = [...kept, entry].sort(
    (a, b) => b.points - a.points || a.at.localeCompare(b.at),
  );
  write(BEST_KEY, all.slice(0, BEST_KEPT));
}

/** Keeps the season just played, in place of the one before. */
export function saveLast(entry: DeviceSeason): void {
  write(LAST_KEY, entry);
}

/**
 * The season played last on this device; null when none or unreadable. The
 * hub passes the storage it reads; the game reads its own.
 */
export function loadLast(
  from: StorageLike | null = storage(),
): DeviceSeason | null {
  const v = read(LAST_KEY, from);
  return isSeason(v) ? v : null;
}
