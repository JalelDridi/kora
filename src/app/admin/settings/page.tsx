import type { Metadata } from "next";
import { CURATED, CURATED_IDS } from "@/admin/edit/curated-patch";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import { SETTINGS_BLURB, SETTINGS_TITLE } from "@/admin/settings";

// The six curated files (Task 6), each edited row by row on its own page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // The password again, never the proxy alone.
  await loadPool();
  return (
    <main className="settings">
      <h1>Settings</h1>
      <p className="dim">
        The curated files the nightly build and the games read. Each save is one
        commit on main, checked by data:check first.
      </p>
      <ul className="settings-list">
        {CURATED_IDS.map((id) => (
          <li key={id}>
            <NavLink href={`/admin/settings/${id}`}>
              {SETTINGS_TITLE[id]}{" "}
              <span className="dim">({CURATED[id].path})</span>
            </NavLink>
            <p className="dim">{SETTINGS_BLURB[id]}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
