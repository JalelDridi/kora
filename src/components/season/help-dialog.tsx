"use client";

import { loadDraftView } from "@/season/device";
import { HelpDialog, type HelpDialogProps } from "../help-dialog";

/** 30–0's help: shut over a draft with a pick already on this device. */
export function SeasonHelpDialog(props: HelpDialogProps) {
  return (
    <HelpDialog
      {...props}
      game="season"
      inProgress={() => {
        const view = loadDraftView() as { squad?: unknown } | null;
        return Array.isArray(view?.squad) && view.squad.length > 0;
      }}
    />
  );
}
