import { anchors, cells, elements, hasClass, isoDate, text } from "./html.ts";

// Transfermarkt pages, read for the private witness (P43, P48). Only ids,
// names and birth dates are taken: enough to say whether a club's page
// lists a footballer. Nothing read here is ever published (S29). Pure.
//
// The league page parser follows a real page's shape (the research probe of
// 4 October 2026). The squad page and player profile parsers are
// UNVERIFIED until the sample run (B5): no such page has been fetched yet;
// they follow Transfermarkt's usual markup as best known, on synthetic
// fixtures, and must be checked against the pages the sample saves.

export type TmClub = {
  id: string;
  slug: string;
  name: string;
  /** Its squad page for the season: /<slug>/kader/verein/<id>/saison_id/<season>. */
  squadPath: string;
};

// Anchored: only these exact path shapes are ever followed (fix round 1).
const CLUB_LINK =
  /^\/([a-z0-9-]+)\/startseite\/verein\/(\d+)\/saison_id\/(\d{4})$/;

/** The league page: each club of the first "items" table, once, in order. */
export function parseLeague(html: string): TmClub[] {
  const table = elements(html, "table", /class="items"/)[0] ?? "";
  const body = elements(table, "tbody")[0] ?? table;
  const out: TmClub[] = [];
  for (const row of elements(body, "tr")) {
    const name = cells(row).find((c) => hasClass(c.cls, "hauptlink"));
    const link = anchors(name?.html ?? row).find((a) => CLUB_LINK.test(a.href));
    if (!link) continue;
    const [, slug, id, season] = CLUB_LINK.exec(link.href)!;
    if (out.some((c) => c.id === id)) continue;
    out.push({
      id,
      slug,
      name: link.title ?? link.text,
      squadPath: `/${slug}/kader/verein/${id}/saison_id/${season}`,
    });
  }
  return out;
}

export type TmSquadPlayer = {
  id: string;
  /** His profile's path, as the row links it. */
  path: string;
  name: string;
  birthDate: string | null;
  /** The row says he is on loan (to or from the club). */
  loan: boolean;
};

const PLAYER_LINK = /^\/[a-z0-9-]+\/profil\/spieler\/(\d+)$/;
/** The canonical link of a profile: the same path on Transfermarkt's host. */
const CANONICAL =
  /^https:\/\/www\.transfermarkt\.[a-z.]+(\/[a-z0-9-]+\/profil\/spieler\/\d+)$/;

/** UNVERIFIED until the sample run: a club's squad page, one row per player. */
export function parseSquad(html: string): TmSquadPlayer[] {
  const table = elements(html, "table", /class="items"/)[0] ?? "";
  const body = elements(table, "tbody")[0] ?? table;
  const out: TmSquadPlayer[] = [];
  // Top-level rows only: each holds a nested table for the name and position.
  for (const row of elements(body, "tr")) {
    const link = anchors(row).find(
      (a) => PLAYER_LINK.test(a.href) && a.text !== "",
    );
    if (!link) continue;
    const id = PLAYER_LINK.exec(link.href)![1];
    if (out.some((p) => p.id === id)) continue;
    const birth = cells(row)
      .map((c) => isoDate(text(c.html)))
      .find((d) => d !== null);
    out.push({
      id,
      path: link.href,
      name: link.title ?? link.text,
      birthDate: birth ?? null,
      loan: /ausgeliehen|on loan|leihe/i.test(row),
    });
  }
  return out;
}

export type TmProfile = {
  id: string | null;
  name: string | null;
  birthDate: string | null;
  /** The club in the page header, as its Transfermarkt id. */
  clubId: string | null;
};

/** UNVERIFIED until the sample run: a player profile's header. */
export function parseProfile(html: string): TmProfile {
  const canonical =
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1] ?? "";
  const headline = elements(html, "h1", /data-header__headline-wrapper/)[0];
  const club = elements(html, "span", /data-header__club/)[0] ?? "";
  const birth = /itemprop="birthDate"[^>]*>([^<]+)</i.exec(html)?.[1] ?? "";
  return {
    id: PLAYER_LINK.exec(CANONICAL.exec(canonical)?.[1] ?? "")?.[1] ?? null,
    name: headline
      ? text(
          headline.replace(/<span[^>]*shirt-number[^>]*>[\s\S]*?<\/span>/i, ""),
        )
      : null,
    birthDate: isoDate(birth),
    clubId: /\/verein\/(\d+)/.exec(club)?.[1] ?? null,
  };
}
