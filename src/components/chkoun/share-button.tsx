"use client";

import { useRef, useState } from "react";

export type ShareChannel = "system" | "copy" | "whatsapp" | "box";

type Props = {
  text: string;
  strings: {
    button: string;
    copy: string;
    copied: string;
    whatsapp: string;
    longPress: string;
  };
  onShared?: (channel: ShareChannel) => void;
};

// Sharing that survives in-app browsers (plan Task 13): the system share
// sheet when the browser has one, else the clipboard, else a WhatsApp link
// and the text in a box to long-press. A visitor who closes the system
// sheet has chosen not to share: nothing else opens.
export function ShareButton({ text, strings, onShared }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "fallback">("idle");
  const box = useRef<HTMLTextAreaElement>(null);

  async function share() {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    if (nav?.share && (!nav.canShare || nav.canShare({ text }))) {
      try {
        await nav.share({ text });
        onShared?.("system");
        return;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        setState("copied");
        onShared?.("copy");
        return;
      } catch {
        // Refused (an in-app browser, no permission): the fallbacks below.
      }
    }
    setState("fallback");
  }

  function selectBox() {
    const el = box.current;
    if (!el) return;
    el.focus();
    el.select();
    try {
      // Deprecated, but the only copy some in-app browsers allow.
      if (document.execCommand("copy")) {
        setState("copied");
        onShared?.("box");
      }
    } catch {
      // The text stays selected for a long-press.
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void share()}
          className="min-h-12 rounded-full bg-mint px-6 text-lg font-semibold text-pitch-950"
        >
          {strings.button}
        </button>
        <p role="status" className="text-base font-semibold text-mint">
          {state === "copied" ? strings.copied : ""}
        </p>
      </div>
      {state === "fallback" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-pitch-700 bg-pitch-900 p-4">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onShared?.("whatsapp")}
            className="flex min-h-11 items-center self-start rounded-full bg-tile-green px-5 font-semibold text-white"
          >
            {strings.whatsapp}
          </a>
          <label className="flex flex-col gap-2 text-base">
            {strings.longPress}
            <textarea
              ref={box}
              readOnly
              value={text}
              rows={text.split("\n").length}
              dir="ltr"
              className="w-full resize-none rounded-xl border-2 border-pitch-700 bg-pitch-950 p-3 font-sans text-base text-chalk"
            />
          </label>
          <button
            type="button"
            onClick={selectBox}
            className="min-h-11 self-start rounded-full border-2 border-mint px-5 font-semibold text-mint"
          >
            {strings.copy}
          </button>
        </div>
      ) : null}
    </div>
  );
}
