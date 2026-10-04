import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import {
  articleLinks,
  confidenceLabel,
  fieldValue,
  poolsLabel,
  provenanceLabel,
  provenanceRows,
  ROW_KINDS,
  sourceLabel,
  sourceNames,
} from "@/admin/pool";

// One footballer as the pool holds him: every field with where it came from
// and how sure it is, his flags, the rows the parsers could not use, and his
// career. Server-rendered, English, no client component.

export const dynamic = "force-dynamic";

async function find(id: string) {
  const pool = await loadPool();
  const player = pool.players.find((p) => p.id === id);
  return player ? { pool, player } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/pool/[id]">): Promise<Metadata> {
  const found = await find((await params).id);
  return { title: found ? found.player.nameLatin : "Not in the pool" };
}

export default async function FootballerPage({
  params,
}: PageProps<"/admin/pool/[id]">) {
  const found = await find((await params).id);
  if (!found) notFound();
  const { pool, player } = found;
  const clubs = new Map(pool.clubs.map((c) => [c.id, c.nameLatin]));
  const clubName = (id: string) => clubs.get(id) ?? id;
  const flags = pool.flags.filter((f) => f.subject === player.wikidataId);
  const rows = flags.filter((f) => ROW_KINDS.includes(f.kind));
  const others = flags.filter((f) => !ROW_KINDS.includes(f.kind));

  return (
    <main>
      <p>
        <NavLink href="/admin/pool">All footballers</NavLink>
      </p>
      <h1>{player.nameLatin}</h1>
      {player.nameArabic && (
        <p>
          <bdi lang="ar" dir="rtl">
            {player.nameArabic}
          </bdi>
        </p>
      )}
      <dl className="facts" aria-label="Footballer">
        {(
          [
            ["Id", player.id],
            ["Wikidata", player.wikidataId],
            [
              "Pools",
              `${poolsLabel(player)}${player.provenance.pools ? " (placed by an override)" : ""}`,
            ],
            ["French name", player.nameFrench ?? "none"],
            ["Aliases", player.aliases.join(", ") || "none"],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="plain" aria-label="Articles">
        {articleLinks(player).map((link) => (
          <li key={link.href}>
            <a href={link.href} rel="noreferrer">
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="scroll">
        <table>
          <caption>Provenance</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Confidence</th>
              <th scope="col">Source</th>
              <th scope="col">Agreeing sources</th>
              <th scope="col">Note</th>
              <th scope="col">Read</th>
            </tr>
          </thead>
          <tbody>
            {provenanceRows(player).map(([field, entry]) => (
              <tr key={field}>
                <th scope="row">{provenanceLabel(field)}</th>
                <td>{fieldValue(player, field, clubName)}</td>
                <td>
                  <span
                    className={`level${entry?.confidence ? ` level-${entry.confidence}` : ""}`}
                  >
                    {confidenceLabel(entry?.confidence)}
                  </span>
                </td>
                <td>{sourceLabel(entry?.source)}</td>
                <td>{entry ? sourceNames(entry.agreeing) : "no entry"}</td>
                <td>{entry?.confidenceNote ?? ""}</td>
                <td className="dim">
                  {entry
                    ? [
                        entry.retrievedAt,
                        entry.asOf && `as of ${entry.asOf}`,
                        entry.ref,
                        entry.by && `by ${entry.by}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Skipped rows ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="dim">None: every infobox row was read.</p>
      ) : (
        <ul className="plain" aria-label="Skipped rows">
          {rows.map((flag, index) => (
            <li key={index}>
              {flag.kind}: {flag.detail}
            </li>
          ))}
        </ul>
      )}

      <h2>Flags ({others.length})</h2>
      {others.length === 0 ? (
        <p className="dim">None.</p>
      ) : (
        <ul className="plain" aria-label="Flags">
          {others.map((flag, index) => (
            <li key={index}>
              <NavLink href={`/admin/pool?flag=${flag.kind}`}>
                {flag.kind}
              </NavLink>
              : {flag.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="scroll">
        <table>
          <caption>Career ({player.history.length} spells)</caption>
          <thead>
            <tr>
              <th scope="col">Club</th>
              <th scope="col">Years</th>
              <th scope="col" className="num">
                Apps
              </th>
              <th scope="col" className="num">
                Goals
              </th>
            </tr>
          </thead>
          <tbody>
            {player.history.map((spell, index) => (
              <tr key={index}>
                <td>
                  {spell.clubId ? clubName(spell.clubId) : spell.clubName}
                  {spell.clubId ? "" : " (no club row)"}
                  {spell.loan ? " (loan)" : ""}
                </td>
                <td>
                  {spell.from ?? "?"}–{spell.to ?? "now"}
                </td>
                <td className="num">{spell.apps ?? "?"}</td>
                <td className="num">{spell.goals ?? "?"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Photo</h2>
      {player.photo ? (
        <p>
          <a href={player.photo.sourceUrl} rel="noreferrer">
            {player.photo.file}
          </a>
          , {player.photo.licence}
          {player.photo.author ? `, by ${player.photo.author}` : ""},{" "}
          {player.photo.width}×{player.photo.height}
        </p>
      ) : (
        <p className="dim">None.</p>
      )}
    </main>
  );
}
