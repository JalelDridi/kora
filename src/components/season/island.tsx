"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraftView, saveDraft } from "@/season/device";
import type { DraftView } from "@/season/device";
import type { Locale } from "@/i18n/locales";
import type fr from "../../../messages/fr.json";
import { Pitch } from "./pitch";
import { SPIN_HEADING, SpinPanel } from "./spin-panel";

export type SeasonStrings = (typeof fr)["season"];

type Props = { locale: Locale; strings: SeasonStrings };

/** idle → drafting → complete → simulated (the season itself: Task 11). */
type Phase = "idle" | "drafting" | "complete" | "simulated";
type Notice = "network" | "tooMany" | "expired" | "closed" | null;

type Request =
  | { action: "start" }
  | { action: "pick"; token: string; pick: string }
  | { action: "respin"; token: string };

function isView(v: unknown): v is DraftView {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.token === "string" &&
    Array.isArray(b.squad) &&
    typeof b.respinLeft === "boolean" &&
    (b.status === "complete" ||
      (b.status === "drafting" && typeof b.spin === "object" && !!b.spin))
  );
}

type Answer =
  | { kind: "ok"; view: DraftView }
  | { kind: "notice"; notice: Exclude<Notice, null> }
  /** The token was refused as too old or invalid. */
  | { kind: "stale" };

async function post(body: Request): Promise<Answer> {
  try {
    const response = await fetch("/api/season/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.status === 429) return { kind: "notice", notice: "tooMany" };
    if (response.status === 503) return { kind: "notice", notice: "closed" };
    if (
      body.action !== "start" &&
      (response.status === 409 || response.status === 403)
    )
      return { kind: "stale" };
    if (!response.ok || !isView(json))
      return { kind: "notice", notice: "network" };
    return { kind: "ok", view: json };
  } catch {
    return { kind: "notice", notice: "network" };
  }
}

// The 30–0 draft in the browser (plan Task 10). It only ever calls
// POST /api/season/draft: the server spins, rates and checks every pick,
// and its signed token carries the draft. The device keeps the last answer,
// so a reload shows the same place without a request.
export function SeasonIsland({ locale, strings: t }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<DraftView | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  /** Set by a pick or a re-spin: the next place's heading takes focus. */
  const moved = useRef(false);

  const send = useCallback(async (body: Request): Promise<void> => {
    setPending(true);
    setNotice(null);
    try {
      let answer = await post(body);
      const stale = answer.kind === "stale";
      if (stale) {
        // Too old or no longer valid: a new draft starts in its place.
        clearDraft();
        answer = await post({ action: "start" });
      }
      if (answer.kind !== "ok")
        return setNotice(answer.kind === "notice" ? answer.notice : "network");
      saveDraft(answer.view.token, answer.view);
      setView(answer.view);
      setPhase(answer.view.status === "complete" ? "complete" : "drafting");
      if (stale) setNotice("expired");
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    // The draft kept on this device, or a new one; state is set once the
    // page runs (storage and fetch are browser-only).
    const id = window.setTimeout(() => {
      const saved = loadDraftView();
      if (isView(saved)) {
        setView(saved);
        setPhase(saved.status === "complete" ? "complete" : "drafting");
      } else void send({ action: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [send]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (phase === "complete") document.getElementById("season-play")?.focus();
    else document.getElementById(SPIN_HEADING)?.focus();
  }, [view, phase]);

  function pick(id: string) {
    if (!view || pending) return;
    moved.current = true;
    void send({ action: "pick", token: view.token, pick: id });
  }

  function respin() {
    if (!view || pending || !view.respinLeft) return;
    moved.current = true;
    void send({ action: "respin", token: view.token });
  }

  const squad = view?.squad ?? [];
  const spin = view?.status === "drafting" ? view.spin : null;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-3">
        <p
          role="status"
          aria-live="polite"
          className="min-h-6 text-base font-semibold"
        >
          {notice ? t.error[notice] : null}
        </p>
        {notice === "network" && !view ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void send({ action: "start" })}
            className="min-h-11 self-start rounded-full bg-mint px-5 font-semibold text-pitch-950"
          >
            {t.error.retry}
          </button>
        ) : null}
        {spin ? (
          <SpinPanel
            spin={spin}
            locale={locale}
            strings={t}
            respinLeft={view?.respinLeft ?? false}
            pending={pending}
            onPick={pick}
            onRespin={respin}
          />
        ) : null}
        {phase === "complete" || phase === "simulated" ? (
          // Playing the season (POST /api/season/play) and its result come
          // with Task 11; the eleven are in and the button is ready for it.
          <button
            id="season-play"
            type="button"
            className="min-h-12 self-start rounded-full bg-mint px-6 text-lg font-bold text-pitch-950"
          >
            {t.play}
          </button>
        ) : null}
      </div>
      <Pitch
        squad={squad}
        current={phase === "drafting" ? squad.length : null}
        locale={locale}
        strings={t}
      />
    </div>
  );
}
