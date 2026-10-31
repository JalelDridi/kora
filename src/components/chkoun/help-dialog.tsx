"use client";

import { deviceStorage, hasGameToday } from "@/chkoun/device";
import { HelpDialog, type HelpDialogProps } from "../help-dialog";

/** Chkoun?'s help: shut over a game of today already on this device. */
export function ChkounHelpDialog(props: HelpDialogProps) {
  return (
    <HelpDialog
      {...props}
      game="chkoun"
      inProgress={() => hasGameToday(deviceStorage(), new Date())}
    />
  );
}
