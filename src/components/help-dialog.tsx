"use client";

import type { ReactNode } from "react";
import {
  helpStorage,
  markHelpSeen,
  shouldOpenHelp,
  type HelpGame,
} from "@/chkoun/help-seen";
import { Dialog } from "./dialog";

export type HelpDialogProps = {
  title: string;
  close: string;
  /** The help itself, rendered on the server. */
  children: ReactNode;
};

// "How to play" (mobile polish M2): opens by itself on a game's first visit
// on this device, then only from the header's "?". Each game says whether
// its device already holds a game of today (chkoun/help-dialog.tsx,
// season/help-dialog.tsx), so each page loads only its own storage code.
export function HelpDialog({
  game,
  inProgress,
  title,
  close,
  children,
}: HelpDialogProps & { game: HelpGame; inProgress: () => boolean }) {
  const autoOpen = () => {
    const storage = helpStorage();
    if (!shouldOpenHelp({ storage, game, inProgress: inProgress() }))
      return false;
    markHelpSeen(storage, game);
    return true;
  };
  return (
    <Dialog
      id={`${game}-help`}
      name="help"
      title={title}
      close={close}
      autoOpen={autoOpen}
    >
      {children}
    </Dialog>
  );
}
