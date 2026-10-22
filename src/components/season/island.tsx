"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bestSeasons,
  clearDraft,
  loadDraftView,
  saveDraft,
  saveSeason,
} from "@/season/device";
import type { DeviceSeason, DraftView } from "@/season/device";
import type { SeasonView } from "@/season/replay";
import { ratingBand } from "@/season/labels";
import { track } from "@/analytics/events";
import { format } from "@/chkoun/labels";
import type { Locale } from "@/i18n/locales";
import type fr from "../../../messages/fr.json";
import { Board } from "./board";
import { Hall } from "./hall";
import { Pitch } from "./pitch";
import { RESULT_HEADING, Result } from "./result";
import { SeasonShareButton } from "./share-button";
import { SPIN_HEADING, SpinPanel } from "./spin-panel";

export type SeasonStrings = (typeof fr)["season"];

type Props = {
  locale: Locale;
  strings: SeasonStrings;
  /** "/ar", "/tn" or "/fr": the replay links open in this language. */
  prefix: string;
  /** The site's address for the shared replay link (site.url). */
  shareOrigin: string;
};

/** idle → drafting → complete → simulated. */
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

type Sent = "ok" | "restarted" | null;

type Answer =
  | { kind: "ok"; view: DraftView }
  | { kind: "notice"; notice: Exclude<Notice, null> }
  /** The token or the pick was refused: the device's copy is stale. */
  | { kind: "stale" };

const STALE = new Set([400, 403, 409, 422]);

/** POST /api/season/play's answer (src/season/play.ts). */
export type PlayView = SeasonView & {
  store: "server" | "device";
  board: { counted: boolean; rank: number | null };
};

function isPlay(v: unknown): v is PlayView {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  const season = b.season as Record<string, unknown> | undefined;
  return (
    typeof b.day === "string" &&
    typeof b.code === "string" &&
    typeof b.clubs === "object" &&
    b.clubs !== null &&
    typeof b.board === "object" &&
    b.board !== null &&
    (b.store === "server" || b.store === "device") &&
    typeof season === "object" &&
    season !== null &&
    Array.isArray(season.matches) &&
    [season.w, season.d, season.l, season.points, season.rating].every(
      (n) => typeof n === "number",
    )
  );
}

type Played =
  | { kind: "ok"; view: PlayView }
  | { kind: "notice"; notice: Exclude<Notice, null> }
  | { kind: "stale" };

async function postPlay(token: string): Promise<Played> {
  try {
    const response = await fetch("/api/season/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    const json: unknown = await response.json().catch(() => null);
    if (response.status === 429) return { kind: "notice", notice: "tooMany" };
    if (response.status === 503) return { kind: "notice", notice: "closed" };
    // Too old, already played, not ours or refused: a new draft starts.
    if (STALE.has(response.status)) return { kind: "stale" };
    if (!response.ok || !isPlay(json))
      return { kind: "notice", notice: "network" };
    return { kind: "ok", view: json };
  } catch {
    return { kind: "notice", notice: "network" };
  }
}

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
    // On a pick or a re-spin, 409 (too old), 403 (not ours), 400 and 422
    // (refused) all mean the device's copy is no longer a draft the server
    // takes: a new one starts in its place.
    if (body.action !== "start" && STALE.has(response.status))
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
export function SeasonIsland({
  locale,
  strings: t,
  prefix,
  shareOrigin,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<DraftView | null>(null);
  const [played, setPlayed] = useState<PlayView | null>(null);
  /** The squad code of the last play: the board marks it (Task 12). */
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [hall, setHall] = useState<DeviceSeason[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  /** Set by a pick or a re-spin: the next place's heading takes focus. */
  const moved = useRef(false);

  /** board_viewed is sent once per page view. */
  const boardSeen = useRef(false);
  const onBoardViewed = useCallback(() => {
    if (boardSeen.current) return;
    boardSeen.current = true;
    track("board_viewed", { locale });
  }, [locale]);

  /**
   * "ok" when the server took the request, "restarted" when a stale draft
   * was replaced by a new one, null when nothing was shown. Truthy: the
   * view is shown.
   */
  const send = useCallback(async (body: Request): Promise<Sent> => {
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
      if (answer.kind !== "ok") {
        setNotice(answer.kind === "notice" ? answer.notice : "network");
        return null;
      }
      saveDraft(answer.view.token, answer.view);
      setView(answer.view);
      setPhase(answer.view.status === "complete" ? "complete" : "drafting");
      if (stale) setNotice("expired");
      return stale ? "restarted" : "ok";
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    // The draft kept on this device, or a new one; state is set once the
    // page runs (storage and fetch are browser-only).
    const id = window.setTimeout(() => {
      track("season_opened", { locale });
      setHall(bestSeasons());
      const saved = loadDraftView();
      if (isView(saved)) {
        setView(saved);
        setPhase(saved.status === "complete" ? "complete" : "drafting");
      } else void send({ action: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [send, locale]);

  useEffect(() => {
    if (!moved.current) return;
    const target = document.getElementById(
      phase === "simulated"
        ? RESULT_HEADING
        : phase === "complete"
          ? "season-play"
          : SPIN_HEADING,
    );
    // Play again: the first spin is not there yet; it takes focus on arrival.
    if (!target) return;
    moved.current = false;
    target.focus();
  }, [view, phase]);

  function pick(id: string) {
    if (!view || pending) return;
    moved.current = true;
    // D-S3-13: the line and the rating band only, never who was picked.
    const line = view.spin?.line;
    const picked = view.spin?.candidates.find((c) => c.id === id);
    void send({ action: "pick", token: view.token, pick: id }).then((sent) => {
      if (sent === "ok" && line && picked)
        track("slot_drafted", {
          line,
          band: ratingBand(picked.rating),
          locale,
        });
    });
  }

  function respin() {
    if (!view || pending || !view.respinLeft) return;
    moved.current = true;
    void send({ action: "respin", token: view.token }).then((sent) => {
      if (sent === "ok") track("respin_used", { locale });
    });
  }

  async function play() {
    if (!view || pending || view.status !== "complete") return;
    setPending(true);
    setNotice(null);
    try {
      const answer = await postPlay(view.token);
      if (answer.kind === "stale") {
        // Too old, already played or refused: the dead token leaves the
        // device and the page, and a new draft starts. Its first spin takes
        // focus; "expired" shows only if it came, else the start's notice.
        clearDraft();
        setView(null);
        setPhase("idle");
        moved.current = true;
        setPending(false);
        if (await send({ action: "start" })) setNotice("expired");
        return;
      }
      if (answer.kind !== "ok") return setNotice(answer.notice);
      const { season } = answer.view;
      // D-S3-13: the record and the rounded rating, never the squad's code.
      track("season_simulated", {
        w: season.w,
        d: season.d,
        l: season.l,
        rating: season.rating,
        locale,
      });
      saveSeason({
        day: answer.view.day,
        xi: answer.view.code,
        w: season.w,
        d: season.d,
        l: season.l,
        points: season.points,
        rating: season.rating,
        replaces: season.replaces,
        at: new Date().toISOString(),
      });
      setHall(bestSeasons());
      setPlayed(answer.view);
      setLastCode(answer.view.code);
      moved.current = true;
      setPhase("simulated");
    } finally {
      setPending(false);
    }
  }

  function playAgain() {
    if (pending) return;
    clearDraft();
    setPlayed(null);
    setView(null);
    setPhase("idle");
    moved.current = true;
    void send({ action: "start" });
  }

  const squad = view?.squad ?? [];
  const spin = view?.status === "drafting" ? view.spin : null;
  /** A draft on its way or in progress; a failed start shows its notice instead. */
  const reserve = phase === "drafting" || (phase === "idle" && !notice);

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
        {reserve ? (
          // Until the 11th pick, the spin area keeps at least a screen's
          // height, so the board and the pitch start below the fold and do
          // not move when the first spin (or the next) arrives.
          <div className="min-h-[100vh] supports-[min-height:100dvh]:min-h-dvh">
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
          </div>
        ) : null}
        {phase === "complete" ? (
          <button
            id="season-play"
            type="button"
            disabled={pending}
            onClick={() => void play()}
            className="min-h-12 self-start rounded-full bg-mint px-6 text-lg font-bold text-pitch-950"
          >
            {t.play}
          </button>
        ) : null}
        {phase === "simulated" && played ? (
          <Result view={played} locale={locale} strings={t}>
            <p className="text-base font-semibold">
              {played.store === "device"
                ? t.result.onDevice
                : played.board.counted && played.board.rank !== null
                  ? format(t.board.rank, { rank: played.board.rank })
                  : t.board.notCounted}
            </p>
            <SeasonShareButton
              season={played.season}
              day={played.day}
              code={played.code}
              origin={shareOrigin}
              prefix={prefix}
              strings={t}
              onShared={(channel) =>
                track("season_shared", { channel, locale })
              }
            />
            <button
              type="button"
              disabled={pending}
              onClick={playAgain}
              className="min-h-11 self-start rounded-full border-2 border-mint px-5 font-semibold text-mint"
            >
              {t.result.again}
            </button>
          </Result>
        ) : null}
        <Hall seasons={hall} prefix={prefix} strings={t} />
        <Board
          locale={locale}
          strings={t}
          ownCode={lastCode}
          onViewed={onBoardViewed}
        />
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
