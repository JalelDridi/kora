import { afterEach, describe, expect, it, vi } from "vitest";
import { startPolling, type PollDoc } from "./poll";

// The board's polling (plan Task 12, D-S3-10): at once, then every 30 s
// while the tab is visible; nothing while it is hidden; stop() leaves no
// timer and no listener behind.

type Fake = PollDoc & {
  set: (state: DocumentVisibilityState) => void;
  listeners: () => number;
};

/** A Document stand-in: set(state) fires visibilitychange. */
function fakeDoc(state: DocumentVisibilityState): Fake {
  const handlers = new Set<() => void>();
  const doc = {
    visibilityState: state,
    addEventListener: (type: string, handler: () => void) => {
      if (type === "visibilitychange") handlers.add(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      if (type === "visibilitychange") handlers.delete(handler);
    },
    set(next: DocumentVisibilityState) {
      doc.visibilityState = next;
      for (const h of [...handlers]) h();
    },
    listeners: () => handlers.size,
  };
  return doc as unknown as Fake;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("startPolling", () => {
  it("fetches at once, then every 30 s while visible", () => {
    vi.useFakeTimers();
    const fetchBoard = vi.fn(async () => {});
    const visibleDoc = fakeDoc("visible");
    const stop = startPolling({
      fetchBoard,
      doc: visibleDoc,
      every: 30_000,
      timers: { set: setInterval, clear: clearInterval },
    });
    vi.advanceTimersByTime(90_000);
    expect(fetchBoard).toHaveBeenCalledTimes(4);
    stop();
  });

  it("stops while the tab is hidden and fetches again when it is shown", () => {
    vi.useFakeTimers();
    const doc = fakeDoc("visible");
    const fetchBoard = vi.fn(async () => {});
    const stop = startPolling({
      fetchBoard,
      doc,
      every: 30_000,
      timers: { set: setInterval, clear: clearInterval },
    });
    doc.set("hidden");
    vi.advanceTimersByTime(120_000);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
    doc.set("visible");
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_000);
    expect(fetchBoard).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not fetch while it starts hidden", () => {
    vi.useFakeTimers();
    const doc = fakeDoc("hidden");
    const fetchBoard = vi.fn(async () => {});
    const stop = startPolling({
      fetchBoard,
      doc,
      every: 30_000,
      timers: { set: setInterval, clear: clearInterval },
    });
    vi.advanceTimersByTime(60_000);
    expect(fetchBoard).not.toHaveBeenCalled();
    doc.set("visible");
    expect(fetchBoard).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stop() clears the timer and the listener", () => {
    vi.useFakeTimers();
    const doc = fakeDoc("visible");
    const fetchBoard = vi.fn(async () => {});
    const stop = startPolling({
      fetchBoard,
      doc,
      every: 30_000,
      timers: { set: setInterval, clear: clearInterval },
    });
    stop();
    vi.advanceTimersByTime(120_000);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
    expect(doc.listeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("calls the timers unbound, as a browser's setInterval requires", () => {
    vi.useFakeTimers();
    const doc = fakeDoc("visible");
    const fetchBoard = vi.fn(async () => {});
    const timers = {
      set: function (this: unknown, fn: () => void, ms: number) {
        if (this !== undefined) throw new TypeError("Illegal invocation");
        return setInterval(fn, ms);
      } as unknown as typeof setInterval,
      clear: function (this: unknown, id: ReturnType<typeof setInterval>) {
        if (this !== undefined) throw new TypeError("Illegal invocation");
        clearInterval(id);
      } as unknown as typeof clearInterval,
    };
    const stop = startPolling({ fetchBoard, doc, every: 30_000, timers });
    vi.advanceTimersByTime(30_000);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a failed fetch is swallowed and the polling goes on", async () => {
    vi.useFakeTimers();
    const doc = fakeDoc("visible");
    const fetchBoard = vi.fn(async () => {
      throw new Error("offline");
    });
    const stop = startPolling({
      fetchBoard,
      doc,
      every: 30_000,
      timers: { set: setInterval, clear: clearInterval },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    stop();
  });
});
