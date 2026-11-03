import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DEPLOYMENT_DATA } from "@/admin/edit/commit.server";
import {
  CURATED,
  CURATED_OFFERS,
  curatedEdit,
  isCuratedId,
  ROW_FIELDS,
} from "@/admin/edit/curated-patch";
import type { CuratedId, HeaderField, Row } from "@/admin/edit/curated-patch";
import { diffFromMessage } from "@/admin/edit/message";
import type { DiffLine } from "@/admin/edit/overrides-patch";
import { readFromMain } from "@/admin/edit/read-overrides.server";
import { validateEdit } from "@/admin/edit/validate";
import { formRecord, saveError } from "@/admin/footballer-page";
import { REPO } from "@/admin/github";
import type { CommitInfo } from "@/admin/github";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import {
  COMPETITION_LABEL,
  FIELD_LABEL,
  SETTINGS_BLURB,
  SETTINGS_TITLE,
  clubShortFilter,
  shortCount,
} from "@/admin/settings";
import { tunisDay } from "@/engine/chkoun/day.ts";
import { clubsWithAutoShort, SHORT_WORD } from "@/pipeline/check.ts";
import { competitions, regions } from "@/pipeline/types.ts";
import type { Pool } from "@/pipeline/types.ts";
import { saveCurated } from "./actions";

// One curated file (Task 6, T-AD-4): main's copy, its header, one table row
// per entry with Edit and Remove, Add at the foot. One row at a time: a
// form (a GET) previews the diff and data:check's result, Save posts the
// same values to a server action that commits that one change. The rows
// carry their key as id, so /admin/settings/ligue1-strength#<club> (the
// 30–0 view's link) lands on the club. English, plain forms, no client
// script. While a form or a preview is open the page holds only it, the
// file's header and a link back (T6 fix round: short on a phone); club-short
// filters its rows with ?q=.

export const dynamic = "force-dynamic";

/** The query's own names; everything else is the form's. */
const CONTROL = [
  "preview",
  "saved",
  "error",
  "edit",
  "add",
  "remove",
  "header",
  "q",
];

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** A row's key as an HTML id: no whitespace (a Ligue 1 club's title has some). */
const anchor = (key: string) => key.replace(/\s+/g, "_");

export async function generateMetadata({
  params,
}: PageProps<"/admin/settings/[file]">): Promise<Metadata> {
  const { file } = await params;
  return { title: isCuratedId(file) ? SETTINGS_TITLE[file] : "Not found" };
}

/** The names the pages show beside the ids the files hold. */
type Names = {
  /** The pool's clubs by name: [id, name, Wikidata id]. */
  clubs: [string, string, string][];
  clubName(id: string): string | undefined;
  clubByQid(qid: string): string | undefined;
  ligue1: Set<string>;
  player(qid: string): string | undefined;
};

function namesOf(pool: Pool): Names {
  const byId = new Map(pool.clubs.map((c) => [c.id, c.nameLatin]));
  const byQid = new Map(pool.clubs.map((c) => [c.wikidataId, c.nameLatin]));
  const players = new Map<string, string>([
    ...pool.dropped.map((d) => [d.wikidataId, d.name] as [string, string]),
    ...pool.players.map((p) => [p.wikidataId, p.nameLatin] as [string, string]),
  ]);
  return {
    clubs: pool.clubs
      .map((c): [string, string, string] => [c.id, c.nameLatin, c.wikidataId])
      .sort((a, b) => a[1].localeCompare(b[1], "en")),
    clubName: (id) => byId.get(id),
    clubByQid: (qid) => byQid.get(qid),
    ligue1: new Set(pool.clubs.filter((c) => c.ligue1).map((c) => c.id)),
    player: (qid) => players.get(qid),
  };
}

export default async function CuratedPage({
  params,
  searchParams,
}: PageProps<"/admin/settings/[file]">) {
  const { file } = await params;
  if (!isCuratedId(file)) notFound();
  const id: CuratedId = file;
  // loadPool checks the admin password again (never the proxy alone).
  const pool = await loadPool();
  const names = namesOf(pool);
  const curated = CURATED[id];
  const offers = CURATED_OFFERS[id];
  const read = await readFromMain(curated.path, `${id}.json`);
  const canSave = read.github !== null;
  let json: unknown = null;
  let rows: Row[] = [];
  let shapeProblem: string | null = null;
  try {
    json = JSON.parse(read.text);
    rows = curated.rows(json);
  } catch {
    shapeProblem = `${curated.path} on main is not in the shape expected: editing is off.`;
  }
  const editable = canSave && shapeProblem === null;

  const query = await searchParams;
  const sent = formRecord(query);
  for (const name of CONTROL) delete sent[name];
  const saved = one(query.saved);
  const savedSha = saved && /^[0-9a-f]{40}$/.test(saved) ? saved : null;
  const error = saveError(one(query.error));
  const commit: CommitInfo | null =
    savedSha && read.github
      ? await read.github.getCommit(savedSha).catch(() => null)
      : null;

  const editKey = one(query.edit);
  const removeKey = offers.remove ? one(query.remove) : undefined;
  const header = one(query.header) as HeaderField | undefined;
  const byKey = (key: string | undefined) =>
    key === undefined ? undefined : rows.find((r) => curated.key(r) === key);
  const page = `/admin/settings/${id}`;
  // club-short's filter, kept in the links that leave the list and come back.
  const q = id === "club-short" ? (one(query.q)?.trim() ?? "") : "";
  const withQ = (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    if (q !== "") search.set("q", q);
    const text = search.toString();
    return text === "" ? page : `${page}?${text}`;
  };
  const back = withQ({});

  const shown = rows.filter(clubShortFilter(q, names.clubName));

  let panel: ReactNode = null;
  if (one(query.preview) === "1")
    panel = (
      <Preview
        id={id}
        sent={sent}
        text={read.text}
        canSave={editable}
        names={names}
        q={q}
      />
    );
  else if (editKey !== undefined)
    panel = byKey(editKey) ? (
      <RowForm
        id={id}
        op="set"
        rowKey={editKey}
        row={byKey(editKey)!}
        sent={sent}
        names={names}
        disabled={!editable}
        back={back}
        q={q}
      />
    ) : (
      <p className="notice">No row {editKey} in this file.</p>
    );
  else if (one(query.add) === "1" && offers.add)
    panel = (
      <RowForm
        id={id}
        op="add"
        row={{}}
        sent={sent}
        names={names}
        disabled={!editable}
        back={back}
        q={q}
      />
    );
  else if (removeKey !== undefined)
    panel = byKey(removeKey) ? (
      <RemoveForm
        id={id}
        rowKey={removeKey}
        shown={rowName(id, byKey(removeKey)!, names)}
        sent={sent}
        disabled={!editable}
        back={back}
        q={q}
      />
    ) : (
      <p className="notice">No row {removeKey} in this file.</p>
    );
  else if (header !== undefined && offers.header.includes(header))
    panel = (
      <HeaderForm
        id={id}
        field={header}
        value={String((json as Record<string, unknown> | null)?.[header] ?? "")}
        sent={sent}
        disabled={!editable}
        back={back}
        q={q}
      />
    );

  return (
    <main className="settings editor">
      <p>
        <NavLink href="/admin/settings">All settings</NavLink>
      </p>
      <h1>{SETTINGS_TITLE[id]}</h1>
      <p className="dim">
        {curated.path}. {SETTINGS_BLURB[id]}
      </p>
      {read.notice ? <p className="notice">{read.notice}</p> : null}
      {shapeProblem ? <p className="notice">{shapeProblem}</p> : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      {savedSha ? <Saved sha={savedSha} commit={commit} /> : null}
      {panel}
      {panel ? (
        <p>
          <NavLink href={back}>All rows</NavLink>
        </p>
      ) : null}
      <FileHeader id={id} json={json} />
      {panel === null ? (
        <>
          {id === "club-short" && shapeProblem === null ? (
            <AutoLabels pool={pool} json={json} names={names} />
          ) : null}
          {id === "club-short" ? <Filter page={page} q={q} /> : null}
          <h2 id="rows">
            {shown.length === rows.length
              ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}`
              : `${shown.length} of ${rows.length} rows`}
          </h2>
          {rows.length === 0 ? <p className="dim">None yet.</p> : null}
          {rows.length > 0 && shown.length === 0 ? (
            <p className="dim">No row matches “{q}”.</p>
          ) : null}
          {shown.length > 0 ? (
            <div className="scroll">
              <table aria-label="Rows" className="rows">
                <thead>
                  <tr>
                    {columns(id).map((c, n) => (
                      <th
                        key={c}
                        scope="col"
                        className={n > 0 ? "more" : undefined}
                      >
                        {c}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const key = curated.key(row);
                    const [first, ...rest] = cells(id, row, names);
                    const name = rowName(id, row, names);
                    return (
                      <tr key={key} id={anchor(key)}>
                        <th scope="row">
                          {first}
                          {rest.length > 0 ? (
                            <span className="sub">
                              {rest.map((cell, n) => (
                                <span key={n}>
                                  {n > 0 ? " · " : ""}
                                  {cell}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </th>
                        {rest.map((cell, n) => (
                          <td key={n} className="more">
                            {cell}
                          </td>
                        ))}
                        <td className="row-actions">
                          <NavLink href={withQ({ edit: key })}>
                            Edit<span className="visually-hidden"> {name}</span>
                          </NavLink>
                          {offers.remove ? (
                            <NavLink href={withQ({ remove: key })}>
                              Remove
                              <span className="visually-hidden"> {name}</span>
                            </NavLink>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {offers.add ? (
            <p className="actions">
              <NavLink href={`${page}?add=1`}>Add a row</NavLink>
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function columns(id: CuratedId): string[] {
  switch (id) {
    case "ligue1-strength":
      return ["Club", "Strength"];
    case "club-short":
      return ["Club", "Latin", "Arabic"];
    case "honours":
      return ["Edition", "Club", "Added"];
    case "afcon-2004":
      return ["Wikidata id", "Name"];
    case "ligue1-clubs":
      return ["English Wikipedia title"];
    case "governorates":
      return ["Latin name", "Arabic name", "French name", "Region"];
  }
}

const arabic = (value: unknown) => (
  <bdi lang="ar" dir="rtl">
    {String(value)}
  </bdi>
);

function edition(row: Row): string {
  const competition = String(row.competition);
  return `${COMPETITION_LABEL[competition] ?? competition} ${String(row.seasonStart)}–${String(row.seasonEnd)}`;
}

/** A row's cells, the first being its heading. */
function cells(id: CuratedId, row: Row, names: Names): ReactNode[] {
  switch (id) {
    case "ligue1-strength":
    case "club-short": {
      const club = String(row.id);
      const name = names.clubName(club);
      const head = (
        <>
          {name ?? club} {name ? <span className="dim">{club}</span> : null}
        </>
      );
      return id === "ligue1-strength"
        ? [head, `strength ${String(row.strength)}`]
        : [head, String(row.latin), arabic(row.arabic)];
    }
    case "honours":
      return [
        edition(row),
        names.clubByQid(String(row.clubWikidataId)) ??
          String(row.clubWikidataId),
        `by ${String(row.by)} on ${String(row.at)}`,
      ];
    case "afcon-2004":
      return [
        String(row.id),
        names.player(String(row.id)) ?? "not in the pool",
      ];
    case "ligue1-clubs":
      return [String(row.title)];
    case "governorates":
      return [
        <>
          {String(row.nameLatin)} <span className="dim">{String(row.id)}</span>
        </>,
        arabic(row.nameArabic),
        String(row.nameFrench),
        String(row.region),
      ];
  }
}

/** A row in a link's or a heading's words. */
function rowName(id: CuratedId, row: Row, names: Names): string {
  switch (id) {
    case "ligue1-strength":
    case "club-short":
      return names.clubName(String(row.id)) ?? String(row.id);
    case "honours":
      return edition(row);
    case "afcon-2004":
      return names.player(String(row.id)) ?? String(row.id);
    case "ligue1-clubs":
      return String(row.title);
    case "governorates":
      return String(row.nameLatin);
  }
}

function FileHeader({ id, json }: { id: CuratedId; json: unknown }) {
  if (typeof json !== "object" || json === null || Array.isArray(json))
    return null;
  const head = json as Record<string, unknown>;
  const fields = (["season", "by", "at", "note"] as const).filter(
    (f) => f in head,
  );
  if (fields.length === 0) return null;
  const offers = CURATED_OFFERS[id].header;
  return (
    <section aria-labelledby="file-head">
      <h2 id="file-head">The file</h2>
      <dl className="answers">
        {fields.map((field) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>
              {head[field] === null ? "none" : String(head[field])}
              {(offers as string[]).includes(field) ? (
                <>
                  {" "}
                  <NavLink href={`/admin/settings/${id}?header=${field}`}>
                    Edit the {field}
                  </NavLink>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {id === "club-short" ? (
        <p className="dim">
          Your first save makes the file yours (by: jalel). Its note keeps the
          word DRAFT until you rewrite it here.
        </p>
      ) : null}
    </section>
  );
}

/** club-short: the clubs the game shows that print an automatic label (data:check's warning), to curate first. */
function AutoLabels({
  pool,
  json,
  names,
}: {
  pool: Pool;
  json: unknown;
  names: Names;
}) {
  const clubs = (json as { clubs: Record<string, unknown> }).clubs;
  const auto = clubsWithAutoShort(pool, clubs);
  if (auto.length === 0) return null;
  return (
    <section aria-labelledby="auto">
      <h2 id="auto">Clubs on an automatic label</h2>
      <p className="dim">
        The game shows these clubs and prints a label made from their name (in
        brackets). Give each its own.
      </p>
      <details className="values">
        <summary>
          {auto.length} {auto.length === 1 ? "club" : "clubs"}
        </summary>
        <ul aria-labelledby="auto" className="auto plain">
          {auto.map((line) => {
            const club = line.split(" ")[0];
            const name = names.clubName(club) ?? club;
            return (
              <li key={club}>
                {name}{" "}
                <span className="dim">{line.slice(club.length + 1)}</span>{" "}
                <NavLink
                  href={`/admin/settings/club-short?add=1&id=${encodeURIComponent(club)}`}
                >
                  Add
                  <span className="visually-hidden">
                    {" "}
                    a label for {name} ({club})
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/** club-short's filter: a GET box on the club's name, id or labels. */
function Filter({ page, q }: { page: string; q: string }) {
  return (
    <form method="get" action={page} role="search" className="field">
      <label htmlFor="q">Filter the rows</label>
      <p className="dim" id="q-hint">
        A club&rsquo;s name, id, Latin or Arabic label.
      </p>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        maxLength={80}
        autoComplete="off"
        aria-describedby="q-hint"
      />
      <div className="actions">
        <button type="submit">Filter</button>
        {q !== "" ? <NavLink href={page}>All rows</NavLink> : null}
      </div>
    </form>
  );
}

/** The filter a form came from, carried through its preview and back. */
function KeepQ({ q }: { q: string }) {
  return q === "" ? null : <input type="hidden" name="q" value={q} />;
}

/** The commit's note: why, and where it says so. */
function Why({ value }: { value: string }) {
  return (
    <div className="field">
      <label htmlFor="f-note">Why (the commit&rsquo;s note)</label>
      <p className="dim" id="f-note-hint">
        Why, and where it says so. Required.
      </p>
      <textarea
        id="f-note"
        name="note"
        rows={2}
        maxLength={500}
        required
        aria-describedby="f-note-hint"
        defaultValue={value}
      />
    </div>
  );
}

const last = (sent: Record<string, string | string[]>, name: string) => {
  const value = sent[name];
  return Array.isArray(value) ? value.at(-1) : value;
};

function RowForm({
  id,
  op,
  rowKey,
  row,
  sent,
  names,
  disabled,
  back,
  q,
}: {
  id: CuratedId;
  op: "set" | "add";
  rowKey?: string;
  row: Row;
  sent: Record<string, string | string[]>;
  names: Names;
  disabled: boolean;
  back: string;
  q: string;
}) {
  const value = (name: string) =>
    last(sent, name) ?? (row[name] === undefined ? "" : String(row[name]));
  const heading =
    op === "add" ? "Add a row" : `Edit ${rowName(id, row, names)}`;
  return (
    <section aria-labelledby="form-head">
      <h2 id="form-head">{heading}</h2>
      <form method="get" action={`/admin/settings/${id}`}>
        <input type="hidden" name="preview" value="1" />
        <KeepQ q={q} />
        <input type="hidden" name="op" value={op} />
        {rowKey !== undefined ? (
          <input type="hidden" name="key" value={rowKey} />
        ) : null}
        <fieldset disabled={disabled} className="fields">
          <legend className="visually-hidden">{heading}</legend>
          {ROW_FIELDS[id].map((name) => (
            <RowField
              key={name}
              id={id}
              name={name}
              value={value(name)}
              names={names}
            />
          ))}
          <Why value={last(sent, "note") ?? ""} />
        </fieldset>
        {disabled ? null : (
          <div className="actions">
            <button type="submit">Preview</button>
            <NavLink href={back}>Cancel</NavLink>
          </div>
        )}
      </form>
    </section>
  );
}

function RowField({
  id,
  name,
  value,
  names,
}: {
  id: CuratedId;
  name: string;
  value: string;
  names: Names;
}) {
  const fid = `f-${name}`;
  const label = FIELD_LABEL[name] ?? name;
  let input: ReactNode;
  let hint: ReactNode = null;

  if (name === "id" && id === "ligue1-strength") {
    // Every Ligue 1 club is listed once: a row's club is not changed here.
    return (
      <div className="field">
        <p>
          <strong>Club</strong>: {names.clubName(value) ?? value}{" "}
          <span className="dim">{value}</span>
        </p>
        <input type="hidden" name="id" value={value} />
      </div>
    );
  }
  if ((name === "id" && id === "club-short") || name === "clubWikidataId") {
    // honours names a club by its Wikidata id, club-short by its id. Each
    // option shows the club's slug: two clubs may share a name. A value
    // that is no option (a crafted ?id=) leaves the choice to him.
    const byQid = name === "clubWikidataId";
    const known = names.clubs.some(
      ([club, , qid]) => (byQid ? qid : club) === value,
    );
    return (
      <div className="field">
        <label htmlFor={fid}>Club</label>
        <select id={fid} name={name} defaultValue={known ? value : ""}>
          {known ? null : <option value="">choose a club</option>}
          {names.clubs.map(([club, clubName, qid]) => (
            <option key={club} value={byQid ? qid : club}>
              {clubName} ({club})
            </option>
          ))}
        </select>
      </div>
    );
  }
  switch (name) {
    case "strength":
    case "seasonStart":
    case "seasonEnd":
      hint = name === "strength" ? "A whole number: 55 (weakest) to 90." : null;
      input = (
        <input
          id={fid}
          name={name}
          type="number"
          inputMode="numeric"
          step={1}
          defaultValue={value}
          aria-describedby={hint ? `${fid}-hint` : undefined}
        />
      );
      break;
    case "latin":
    case "arabic":
      hint = (
        <span data-testid={`${name}-count`}>
          {shortCount(value, SHORT_WORD[name])}
        </span>
      );
      input = (
        <input
          id={fid}
          name={name}
          type="text"
          defaultValue={value}
          aria-describedby={`${fid}-hint`}
          {...(name === "arabic" ? { dir: "rtl", lang: "ar" } : {})}
        />
      );
      break;
    case "nameArabic":
      input = (
        <input
          id={fid}
          name={name}
          type="text"
          dir="rtl"
          lang="ar"
          defaultValue={value}
        />
      );
      break;
    case "competition":
      input = (
        <select id={fid} name={name} defaultValue={value}>
          {value === "" ? <option value="">choose a competition</option> : null}
          {competitions.map((c) => (
            <option key={c} value={c}>
              {COMPETITION_LABEL[c] ?? c}
            </option>
          ))}
        </select>
      );
      break;
    case "region":
      input = (
        <select id={fid} name={name} defaultValue={value}>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      );
      break;
    default:
      if (name === "id" && id === "afcon-2004") {
        const known = value === "" ? undefined : names.player(value);
        hint = (
          <>
            Q followed by digits
            {value === "" ? "" : known ? `: ${known}` : ": not in the pool"}.
          </>
        );
      }
      input = (
        <input
          id={fid}
          name={name}
          type="text"
          defaultValue={value}
          aria-describedby={hint ? `${fid}-hint` : undefined}
        />
      );
  }
  return (
    <div className="field">
      <div className="head">
        <label htmlFor={fid}>{label}</label>
      </div>
      {hint ? (
        <p className="dim" id={`${fid}-hint`}>
          {hint}
        </p>
      ) : null}
      {input}
    </div>
  );
}

function RemoveForm({
  id,
  rowKey,
  shown,
  sent,
  disabled,
  back,
  q,
}: {
  id: CuratedId;
  rowKey: string;
  shown: string;
  sent: Record<string, string | string[]>;
  disabled: boolean;
  back: string;
  q: string;
}) {
  return (
    <section aria-labelledby="form-head">
      <h2 id="form-head">Remove {shown}</h2>
      <form method="get" action={`/admin/settings/${id}`}>
        <input type="hidden" name="preview" value="1" />
        <KeepQ q={q} />
        <input type="hidden" name="op" value="remove" />
        <input type="hidden" name="key" value={rowKey} />
        <fieldset disabled={disabled} className="fields">
          <legend className="visually-hidden">Remove {shown}</legend>
          <Why value={last(sent, "note") ?? ""} />
        </fieldset>
        {disabled ? null : (
          <div className="actions">
            <button type="submit">Preview</button>
            <NavLink href={back}>Cancel</NavLink>
          </div>
        )}
      </form>
    </section>
  );
}

function HeaderForm({
  id,
  field,
  value,
  sent,
  disabled,
  back,
  q,
}: {
  id: CuratedId;
  field: HeaderField;
  value: string;
  sent: Record<string, string | string[]>;
  disabled: boolean;
  back: string;
  q: string;
}) {
  const current = last(sent, "value") ?? value;
  return (
    <section aria-labelledby="form-head">
      <h2 id="form-head">Edit the {field}</h2>
      <form method="get" action={`/admin/settings/${id}`}>
        <input type="hidden" name="preview" value="1" />
        <KeepQ q={q} />
        <input type="hidden" name="op" value="header" />
        <input type="hidden" name="field" value={field} />
        <fieldset disabled={disabled} className="fields">
          <legend className="visually-hidden">Edit the {field}</legend>
          <div className="field">
            <label htmlFor="f-value">
              {field === "note" ? "Note" : "Season"}
            </label>
            {field === "note" ? (
              <textarea
                id="f-value"
                name="value"
                rows={5}
                defaultValue={current}
              />
            ) : (
              <input
                id="f-value"
                name="value"
                type="text"
                defaultValue={current}
              />
            )}
          </div>
          <Why value={last(sent, "note") ?? ""} />
        </fieldset>
        {disabled ? null : (
          <div className="actions">
            <button type="submit">Preview</button>
            <NavLink href={back}>Cancel</NavLink>
          </div>
        )}
      </form>
    </section>
  );
}

function Diff({ diff }: { diff: DiffLine[] }) {
  return (
    <div className="scroll">
      <table aria-label="Changes" className="diff">
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Before → after</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((line) => (
            <tr key={line.path}>
              <th scope="row">{line.path}</th>
              <td>
                <bdi>{line.before}</bdi> → <bdi>{line.after}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where "Change the values" goes: the form the preview came from, filled. */
function backTo(
  id: CuratedId,
  sent: Record<string, string | string[]>,
  q: string,
) {
  const query = new URLSearchParams();
  const op = last(sent, "op");
  const key = last(sent, "key") ?? "";
  if (op === "set") query.set("edit", key);
  else if (op === "add") query.set("add", "1");
  else if (op === "remove") query.set("remove", key);
  else if (op === "header") query.set("header", last(sent, "field") ?? "");
  for (const [name, value] of Object.entries(sent))
    if (!["op", "key", "field"].includes(name))
      for (const v of Array.isArray(value) ? value : [value])
        query.append(name, v);
  if (q !== "") query.set("q", q);
  return `/admin/settings/${id}?${query}`;
}

async function Preview({
  id,
  sent,
  text,
  canSave,
  names,
  q,
}: {
  id: CuratedId;
  sent: Record<string, string | string[]>;
  text: string;
  canSave: boolean;
  names: Names;
  q: string;
}) {
  const edit = await curatedEdit({
    id,
    form: sent,
    text,
    today: tunisDay(new Date()),
  });
  const checked =
    edit.ok && edit.applied.changed
      ? await validateEdit(CURATED[id].path, edit.applied.text, DEPLOYMENT_DATA)
      : { errors: [], warnings: [] };
  const errors = edit.ok ? checked.errors : edit.errors;
  const ready = edit.ok && edit.applied.changed && errors.length === 0;
  const afconName =
    id === "afcon-2004" && last(sent, "id")
      ? names.player(last(sent, "id")!)
      : undefined;
  return (
    <section aria-labelledby="preview">
      <h2 id="preview">Preview</h2>
      {errors.length > 0 ? (
        // A list may not carry role="alert": the box around it does.
        <div role="alert" className="notice notice-error">
          <ul className="plain">
            {errors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {edit.ok && !edit.applied.changed ? (
        <p className="notice">No value changes: nothing to save.</p>
      ) : null}
      {edit.ok && edit.applied.changed ? (
        <>
          <Diff diff={edit.applied.diff} />
          {afconName ? <p>{afconName}, in the pool.</p> : null}
          {errors.length === 0 ? (
            <p data-testid="checked">
              data:check finds no error in this change.
            </p>
          ) : null}
          <h3>Commit message</h3>
          <pre className="message">{edit.applied.message}</pre>
          {checked.warnings.length > 0 ? (
            <details className="values">
              <summary>
                {checked.warnings.length}{" "}
                {checked.warnings.length === 1 ? "warning" : "warnings"}
              </summary>
              <ul className="plain warnings">
                {checked.warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
      <div className="actions">
        {ready && canSave ? (
          <form action={saveCurated}>
            <input type="hidden" name="file" value={id} />
            {Object.entries(sent).flatMap(([key, value]) =>
              (Array.isArray(value) ? value : [value]).map((v, i) => (
                <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
              )),
            )}
            <button type="submit">Save</button>
          </form>
        ) : null}
        <NavLink href={backTo(id, sent, q)}>Change the values</NavLink>
      </div>
    </section>
  );
}

/** After a save's redirect: `commit` is null when GitHub does not return it. */
function Saved({ sha, commit }: { sha: string; commit: CommitInfo | null }) {
  const url =
    commit?.url ??
    `https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`;
  const diff = commit ? diffFromMessage(commit.message) : [];
  return (
    <section aria-labelledby="saved" className="notice">
      <p role="status" id="saved">
        {commit ? (
          <>
            Saved as <a href={url}>{sha.slice(0, 7)}</a> on main.
          </>
        ) : (
          <>
            Commit <a href={url}>{sha.slice(0, 7)}</a>
          </>
        )}
      </p>
      {commit ? <p>{commit.message.split("\n")[0]}</p> : null}
      {diff.length > 0 ? <Diff diff={diff} /> : null}
      <p>
        The games change after a rebuild:{" "}
        <NavLink href="/admin/rebuild">Rebuild now</NavLink>
      </p>
    </section>
  );
}
