"use client";

import { draftUnderWay, loadDraftView } from "@/season/device";
import { HelpDialog, type HelpDialogProps } from "../help-dialog";

/** 30–0's help: shut over a draft with a pick already on this device. */
export function SeasonHelpDialog(props: HelpDialogProps) {
  return (
    <HelpDialog
      {...props}
      game="season"
      inProgress={() => draftUnderWay(loadDraftView())}
    />
  );
}
