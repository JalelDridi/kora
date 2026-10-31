"use client";

import { deviceStorage, loadGame } from "@/chkoun/device";
import { puzzleNumber, tunisDay } from "@/engine/chkoun/day.ts";
import { HelpDialog, type HelpDialogProps } from "../help-dialog";

/** Chkoun?'s help: shut over a game of today already on this device. */
export function ChkounHelpDialog(props: HelpDialogProps) {
  return (
    <HelpDialog
      {...props}
      game="chkoun"
      inProgress={() =>
        loadGame(deviceStorage(), puzzleNumber(tunisDay(new Date()))) !== null
      }
    />
  );
}
