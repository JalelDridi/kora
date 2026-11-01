import type { StorageLike } from "./device.ts";

// Whether the "how to play" dialog opens by itself (mobile polish M2): once
// per game on a device, never over a game already under way. The flag is one
// key for both games. In-app browsers (Facebook, Instagram) may refuse or
// wipe storage: then the dialog opens at most once per page view (a module
// flag), and again on the next visit, which is acceptable.

export const HELP_KEY = "kora.help.v1";

export type HelpGame = "chkoun" | "season";

/** The games whose help opened in this page view, storage or not. */
const openedThisView = new Set<HelpGame>();

/**
 * The browser's local storage, or null where it is refused. Its own copy of
 * deviceStorage (device.ts), so the 30–0 page loads no Chkoun? code.
 */
export function helpStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readSeen(storage: StorageLike | null): Record<string, unknown> {
  if (!storage) return {};
  try {
    const text = storage.getItem(HELP_KEY);
    const v: unknown = text === null ? null : JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function helpSeen(storage: StorageLike | null, game: HelpGame): boolean {
  return readSeen(storage)[game] === 1;
}

export function markHelpSeen(
  storage: StorageLike | null,
  game: HelpGame,
): void {
  openedThisView.add(game);
  if (!storage) return;
  try {
    storage.setItem(
      HELP_KEY,
      JSON.stringify({ ...readSeen(storage), [game]: 1 }),
    );
  } catch {
    // Refused or full: the module flag keeps it shut for this page view.
  }
}

export function shouldOpenHelp({
  storage,
  game,
  inProgress,
}: {
  storage: StorageLike | null;
  game: HelpGame;
  inProgress: boolean;
}): boolean {
  if (inProgress || openedThisView.has(game)) return false;
  return !helpSeen(storage, game);
}
