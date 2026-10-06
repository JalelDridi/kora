import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Pool, PoolPlayer } from "../src/pipeline/types";

// Shared by the Chkoun? browser tests: the pool the server reads, and a
// visitor's way of guessing (type the name, pick it from the list).

export const pool = JSON.parse(readFileSync("data/pool.json", "utf8")) as Pool;

export function footballer(id: string): PoolPlayer {
  const found = pool.players.find((p) => p.id === id);
  if (!found) throw new Error(`no footballer ${id} in the pool`);
  return found;
}

/** Waits until the game has asked the server for today and is ready. */
export async function ready(page: Page) {
  await expect(page.getByRole("combobox")).toBeEnabled();
}

export async function guess(page: Page, id: string) {
  const { nameLatin } = footballer(id);
  const box = page.getByRole("combobox");
  await expect(box).toBeEnabled();
  await box.fill(nameLatin);
  const option = page
    .getByRole("listbox")
    .getByRole("option")
    .filter({ hasText: nameLatin })
    .first();
  await option.click();
  await expect(page.locator(`[data-guess="${id}"]`)).toHaveCount(1);
}

export async function noSidewaysScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}
