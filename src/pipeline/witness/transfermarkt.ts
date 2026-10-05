import { anchors, cells, elements, hasClass, isoDate, text } from "./html.ts";

// Transfermarkt pages, read for the private witness (P43, P48). Only ids,
// names and ages are taken: enough to say whether a club's page lists a
// footballer. Nothing read here is ever published (S29). Pure.
//
// Every parser here follows a real page's shape: the league page (research
// probe, 4 October 2026), the squad page and a profile (sample run, 5
// October 2026). Still UNVERIFIED: how a player on loan AT the club is
// marked (the sample had none).

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
  /** Only when the page has a "Date of birth" column; the compact squad view has none. */
  birthDate: string | null;
  /** The "Age" column. */
  age: number | null;
  /** The row's transfer badge says he is on loan at the club (UNVERIFIED shape). */
  loan: boolean;
};

// Anchored: only these exact path shapes are ever followed (fix round 1).
const PLAYER_LINK = /^\/[a-z0-9-]+\/profil\/spieler\/(\d+)$/;
/** The canonical link of a profile: the same path on Transfermarkt's host. */
const CANONICAL =
  /^https:\/\/www\.transfermarkt\.[a-z.]+(\/[a-z0-9-]+\/profil\/spieler\/\d+)$/;

/**
 * A loan badge. The sample (5 October 2026) showed only "Joined from ...;
 * fee: ..." and "Returned after loan spell ...; fee: End of loan" (back
 * from a loan, so his own club now): neither is a loan. A player on loan
 * AT the club was not in the sample: "on loan from" or "fee: loan" is a
 * guess, UNVERIFIED.
 */
function onLoan(row: string): boolean {
  const titles = [
    ...row.matchAll(
      /<span class="wechsel-kader-wappen[^"]*"[^>]*>\s*<a\b[^>]*title="([^"]*)"/gi,
    ),
  ].map((m) => m[1]);
  return titles.some(
    (t) =>
      !/end of loan|returned after loan/i.test(t) &&
      /\bon loan\b|fee:\s*loan\b|loan fee|ausgeliehen|leihe/i.test(t),
  );
}

/**
 * A club's squad page (checked on the sample of 5 October 2026): one row
 * per player in the first "items" table; columns found by their header
 * ("Age", "Date of birth" when present). Every row with a profile link is
 * a player, a missing contract date included.
 */
export function parseSquad(html: string): TmSquadPlayer[] {
  const table = elements(html, "table", /class="items"/)[0] ?? "";
  const head = elements(elements(table, "thead")[0] ?? "", "th").map((h) =>
    text(h),
  );
  const ageAt = head.findIndex((h) => /^age$/i.test(h));
  const birthAt = head.findIndex((h) => /date of birth/i.test(h));
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
    const row_ = cells(row);
    const cellText = (i: number) =>
      i >= 0 && row_[i] ? text(row_[i].html) : "";
    // "27", or the birth column's "Mar 3, 1999 (27)".
    const age =
      /^(\d{1,2})$/.exec(cellText(ageAt)) ??
      /\((\d{1,2})\)/.exec(cellText(birthAt));
    out.push({
      id,
      path: link.href,
      name: link.title ?? link.text,
      birthDate: isoDate(cellText(birthAt)),
      age: age ? Number(age[1]) : null,
      loan: onLoan(row),
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

/** A player profile's header (checked on the sample of 5 October 2026). */
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
