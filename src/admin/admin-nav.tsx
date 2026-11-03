import { NavLink } from "./nav-link.tsx";

// The admin's nav (Task 9): the eight places, one row. On a phone the row
// scrolls sideways inside itself (44 px links); from 40rem it wraps. The
// current place is marked with aria-current. Each section's layout (and the
// home page) names its place: a server layout cannot read the path, and
// one that could would keep the first page's mark across navigations.

export const NAV = [
  ["home", "/admin", "Home"],
  ["pool", "/admin/pool", "Pool"],
  ["games", "/admin/games/chkoun", "Games"],
  ["add", "/admin/add", "Add"],
  ["settings", "/admin/settings", "Settings"],
  ["rebuild", "/admin/rebuild", "Rebuild"],
  ["changes", "/admin/changes", "Changes"],
  ["calendar", "/admin/chkoun", "Calendar"],
] as const;

export type NavPlace = (typeof NAV)[number][0];

export function AdminNav({ current }: { current: NavPlace | null }) {
  return (
    <nav className="admin" aria-label="Admin pages">
      <ul>
        {NAV.map(([place, href, label]) => (
          <li key={place}>
            <NavLink
              href={href}
              {...(place === current ? { "aria-current": "page" } : {})}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
