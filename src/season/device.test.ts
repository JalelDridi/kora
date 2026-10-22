import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BEST_KEY,
  bestSeasons,
  clearDraft,
  DRAFT_KEY,
  loadDraft,
  loadDraftView,
  saveDraft,
  saveSeason,
  type DeviceSeason,
} from "./device";

// What the visitor's browser keeps of 30–0: the draft token, so a reload
// brings the draft back, and the best ten seasons. Unit tests run in Node,
// so each test gets its own in-memory localStorage.

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const season = (points: number): DeviceSeason => ({
  day: "2026-10-07",
  xi: `c${points}`,
  w: 20,
  d: points - 60,
  l: 0,
  points,
  rating: 85,
  replaces: "club-africain",
  at: "2026-10-07T10:00:00Z",
});

describe("the draft on the device", () => {
  it("a draft token survives a reload", () => {
    saveDraft("v1.a.b");
    expect(loadDraft()).toBe("v1.a.b");
    expect(storage.data.has(DRAFT_KEY)).toBe(true);
  });

  it("clearing the draft forgets it", () => {
    saveDraft("v1.a.b");
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("a stored value that is not text is ignored", () => {
    storage.setItem(DRAFT_KEY, JSON.stringify({ token: 3 }));
    expect(loadDraft()).toBeNull();
    expect(loadDraftView()).toBeNull();
  });

  it("the endpoint's last answer is kept with its token", () => {
    const view = {
      token: "v1.a.b",
      squad: [],
      respinLeft: true,
      status: "complete" as const,
    };
    saveDraft("v1.a.b", view);
    expect(loadDraft()).toBe("v1.a.b");
    expect(loadDraftView()).toEqual(view);
  });

  it("an answer kept with another token is not shown", () => {
    storage.setItem(
      DRAFT_KEY,
      JSON.stringify({ token: "v1.a.b", view: { token: "v1.x.y" } }),
    );
    expect(loadDraft()).toBe("v1.a.b");
    expect(loadDraftView()).toBeNull();
  });
});

describe("the best seasons on the device", () => {
  it("best seasons keep the top 10 by points", () => {
    for (let p = 70; p < 82; p++) saveSeason(season(p));
    expect(bestSeasons().map((s) => s.points)).toEqual([
      81, 80, 79, 78, 77, 76, 75, 74, 73, 72,
    ]);
    expect(storage.data.has(BEST_KEY)).toBe(true);
  });

  it("a corrupt list reads as empty and is replaced on the next save", () => {
    storage.setItem(BEST_KEY, "{not json");
    expect(bestSeasons()).toEqual([]);
    saveSeason(season(75));
    expect(bestSeasons().map((s) => s.points)).toEqual([75]);
  });
});

describe("a storage that refuses", () => {
  it("a storage that throws changes nothing and throws nothing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveDraft("x")).not.toThrow();
    expect(loadDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
    expect(() => saveSeason(season(80))).not.toThrow();
    expect(bestSeasons()).toEqual([]);
  });

  it("no storage at all (an in-app browser) is the same", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveDraft("x")).not.toThrow();
    expect(loadDraft()).toBeNull();
    expect(bestSeasons()).toEqual([]);
  });
});
