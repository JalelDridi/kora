"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAccess } from "@/admin/access";
import { CalendarActionError, changeDay } from "@/admin/calendar";
import type { CalendarChange } from "@/admin/calendar";
import { getKv, kvEnv } from "@/chkoun/kv";
import { puzzleKey } from "@/chkoun/puzzle.server";
import { withPg } from "@/db/pg";
import { tunisToday } from "@/pipeline/calendar.ts";

// Jalel's three changes to a day of the Chkoun? calendar. A server action is
// a public POST endpoint whatever the page shows, so each one checks the
// admin password itself (the proxy checks it too), validates the day and
// the footballer on the server (src/admin/calendar.ts), and answers with a
// redirect to the page: no client script, the CSP's form-action 'self'
// holds. Refusals come back as a code, never as a footballer.

async function requireAdmin(): Promise<void> {
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    throw new Error("Not found");
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

async function apply(change: CalendarChange): Promise<never> {
  await requireAdmin();
  let error: string | null = null;
  try {
    await withPg(async (db) =>
      changeDay(db, change, {
        today: await tunisToday(db),
        seed: process.env.CHKOUN_SEED,
      }),
    );
    // A cached copy of that day's answer must not outlive the change.
    await getKv()
      ?.del(puzzleKey(kvEnv(), change.day))
      .catch(() => {});
  } catch (caught) {
    error = caught instanceof CalendarActionError ? caught.code : "failed";
    if (error === "failed") console.error("admin: a calendar change failed");
  }
  revalidatePath("/admin/chkoun");
  redirect(
    error
      ? `/admin/chkoun?error=${error}`
      : `/admin/chkoun?done=${encodeURIComponent(change.day)}`,
  );
}

export async function swapDay(form: FormData): Promise<void> {
  await apply({
    action: "swap",
    day: field(form, "day"),
    playerId: field(form, "player"),
  });
}

export async function pinDay(form: FormData): Promise<void> {
  await apply({
    action: "pin",
    day: field(form, "day"),
    playerId: field(form, "player"),
    note: field(form, "note"),
  });
}

export async function redrawDay(form: FormData): Promise<void> {
  await apply({ action: "redraw", day: field(form, "day") });
}
