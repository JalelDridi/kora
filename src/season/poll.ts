// The board's polling (plan Task 12, D-S3-10): fetch at once, then every
// `every` ms while the tab is visible. A hidden tab stops the timer; shown
// again, it fetches at once and starts over. Pure: the document and the
// timers are passed in, so the unit test needs no DOM. A failed fetch is
// swallowed (the board keeps what it showed) and the polling goes on.

export type PollDoc = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

export type PollInput = {
  fetchBoard: () => Promise<void>;
  doc: PollDoc;
  every: number;
  timers: { set: typeof setInterval; clear: typeof clearInterval };
};

/** Starts polling; returns stop, which clears the timer and the listener. */
export function startPolling({
  fetchBoard,
  doc,
  every,
  timers,
}: PollInput): () => void {
  // Called unbound: a browser's setInterval throws "Illegal invocation"
  // when called as a method of another object (timers.set(...)).
  const { set, clear } = timers;
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    fetchBoard().catch(() => {});
  };
  const start = () => {
    if (timer !== null) return;
    tick();
    timer = set(tick, every);
  };
  const halt = () => {
    if (timer === null) return;
    clear(timer);
    timer = null;
  };
  const onChange = () => {
    if (doc.visibilityState === "hidden") halt();
    else start();
  };
  doc.addEventListener("visibilitychange", onChange);
  if (doc.visibilityState !== "hidden") start();
  return () => {
    halt();
    doc.removeEventListener("visibilitychange", onChange);
  };
}
