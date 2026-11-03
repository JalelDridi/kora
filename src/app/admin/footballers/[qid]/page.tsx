import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEPLOYMENT_DATA } from "@/admin/edit/commit.server";
import { footballerEdit } from "@/admin/edit/footballer";
import { diffFromMessage } from "@/admin/edit/message";
import type { DiffLine } from "@/admin/edit/overrides-patch";
import { validateEdit } from "@/admin/edit/validate";
import { editorNames, formRecord } from "@/admin/footballer-page";
import type { EditorNames } from "@/admin/footballer-page";
import { getGitHub, GitHubError, REPO } from "@/admin/github";
import type { CommitInfo, GitHub } from "@/admin/github";
import { loadPool } from "@/admin/load-pool";
import { NavLink } from "@/admin/nav-link";
import {
  confidenceLabel,
  formValue,
  overrideRows,
  sourceLabel,
} from "@/admin/pool";
import type { OverrideRow } from "@/admin/pool";
import { tunisDay } from "@/engine/chkoun/day.ts";
import { lines } from "@/pipeline/types.ts";
import type { PlayerOverride } from "@/pipeline/overrides.ts";
import { saveFootballer } from "./actions";

// One footballer's overrides (T-AD-4: by Wikidata id, so a footballer left
// out, excluded or just included has a page too). Every field shows today's
// value in the deployed pool with its source and confidence, and the
// override in force on main. Preview is a GET of this page with the form in
// the query (nothing stored); Save posts the same values to a server action
// that commits one change of data/overrides.json. English, plain forms, no
// client script.

export const dynamic = "force-dynamic";

const PATH = "data/overrides.json";
const QID = /^Q\d+$/;

type Overrides = {
  text: string;
  /** null: saving is off (no GitHub, or it could not be read). */
  github: GitHub | null;
  notice: string | null;
};

/** main's copy, so a save made a minute ago shows; else the deployed file. */
async function readOverrides(): Promise<Overrides> {
  const deployed = async () => (await DEPLOYMENT_DATA.read("overrides.json"))!;
  const github = getGitHub();
  if (!github)
    return {
      text: await deployed(),
      github: null,
      notice:
        "GitHub not connected: showing the deployed overrides; saving is off.",
    };
  try {
    return { text: (await github.readFile(PATH)).text, github, notice: null };
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    return {
      text: await deployed(),
      github: null,
      notice: `GitHub could not be read (${error.message}): showing the deployed overrides; saving is off.`,
    };
  }
}

const SAVE_ERRORS: Record<string, string> = {
  off: "Not saved: edits are off here (no GitHub token on this deployment).",
  unchanged: "Not saved: no value changed.",
  conflict: "Not saved: main changed twice while saving. Try again.",
  github:
    "Not saved: GitHub did not answer as expected. Try again in a minute.",
  refused:
    "Not saved: main's copy refuses this change now. Preview it again to see why.",
};

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export async function generateMetadata({
  params,
}: PageProps<"/admin/footballers/[qid]">): Promise<Metadata> {
  const { qid } = await params;
  const pool = await loadPool();
  const player = pool.players.find((p) => p.wikidataId === qid);
  return { title: `Edit ${player?.nameLatin ?? qid}` };
}

export default async function FootballerEditorPage({
  params,
  searchParams,
}: PageProps<"/admin/footballers/[qid]">) {
  const { qid } = await params;
  if (!QID.test(qid)) notFound();
  // loadPool checks the admin password again (never the proxy alone).
  const pool = await loadPool();
  const query = await searchParams;
  const player = pool.players.find((p) => p.wikidataId === qid) ?? null;
  const dropped = pool.dropped.find((d) => d.wikidataId === qid) ?? null;
  const names = await editorNames(pool, DEPLOYMENT_DATA);
  const overrides = await readOverrides();
  const entry = (
    JSON.parse(overrides.text) as { players: Record<string, PlayerOverride> }
  ).players[qid];
  const rows = overrideRows(player, entry, names);

  // The form's own values, when they come back from a preview.
  const sent = formRecord(query);
  for (const name of ["preview", "saved", "error"]) delete sent[name];
  const returned = sent.qid === qid;
  const saved = one(query.saved);
  const savedSha = saved && /^[0-9a-f]{40}$/.test(saved) ? saved : null;
  const error = SAVE_ERRORS[one(query.error) ?? ""] ?? null;
  const name = player?.nameLatin ?? dropped?.name ?? qid;

  return (
    <main className="editor">
      <p>
        {player ? (
          <NavLink href={`/admin/pool/${player.id}`}>
            {player.nameLatin} in the pool
          </NavLink>
        ) : (
          <NavLink href="/admin/pool">All footballers</NavLink>
        )}
      </p>
      <h1>{name}</h1>
      <p className="dim">
        {qid}
        {player
          ? ""
          : dropped
            ? `: left out of the pool (${dropped.reason})`
            : ": not in the pool"}
      </p>
      {overrides.notice ? <p className="notice">{overrides.notice}</p> : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      {savedSha ? <Saved sha={savedSha} github={overrides.github} /> : null}
      {one(query.preview) === "1" ? (
        <Preview
          qid={qid}
          sent={sent}
          text={overrides.text}
          player={player}
          names={names}
          canSave={overrides.github !== null}
        />
      ) : (
        <EditForm
          qid={qid}
          rows={rows}
          names={names}
          sent={returned ? sent : null}
          disabled={overrides.github === null}
        />
      )}
    </main>
  );
}

function Diff({ diff }: { diff: DiffLine[] }) {
  return (
    <div className="scroll">
      <table aria-label="Changes" className="diff">
        <thead>
          <tr>
            <th scope="col">Path</th>
            <th scope="col">Before → after</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((line) => (
            <tr key={line.path}>
              <th scope="row">{line.path}</th>
              <td>
                {line.before} → {line.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Saved({ sha, github }: { sha: string; github: GitHub | null }) {
  const commit: CommitInfo | null = github
    ? await github.getCommit(sha).catch(() => null)
    : null;
  const url =
    commit?.url ??
    `https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`;
  const diff = commit ? diffFromMessage(commit.message) : [];
  return (
    <section aria-labelledby="saved" className="notice">
      <p role="status" id="saved">
        Saved as <a href={url}>{sha.slice(0, 7)}</a> on main.
      </p>
      {diff.length > 0 ? <Diff diff={diff} /> : null}
      <p>
        The games change after a rebuild:{" "}
        <NavLink href="/admin/rebuild">Rebuild now</NavLink>
      </p>
    </section>
  );
}

async function Preview({
  qid,
  sent,
  text,
  player,
  names,
  canSave,
}: {
  qid: string;
  sent: Record<string, string | string[]>;
  text: string;
  player: Parameters<typeof footballerEdit>[0]["player"];
  names: EditorNames;
  canSave: boolean;
}) {
  const edit = await footballerEdit({
    form: { ...sent, qid },
    text,
    player,
    names,
    today: tunisDay(new Date()),
  });
  const checked =
    edit.ok && edit.applied.changed
      ? await validateEdit(PATH, edit.applied.text, DEPLOYMENT_DATA)
      : { errors: [], warnings: [] };
  const errors = edit.ok ? checked.errors : edit.errors;
  const back = new URLSearchParams();
  for (const [key, value] of Object.entries(sent))
    for (const v of Array.isArray(value) ? value : [value]) back.append(key, v);
  back.set("qid", qid);
  const changeHref = `/admin/footballers/${qid}?${back}`;

  return (
    <section aria-labelledby="preview">
      <h2 id="preview">Preview</h2>
      {errors.length > 0 ? (
        <ul role="alert" className="notice notice-error plain">
          {errors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {edit.ok && !edit.applied.changed ? (
        <p className="notice">No value changes: nothing to save.</p>
      ) : null}
      {edit.ok && edit.applied.changed ? (
        <>
          <Diff diff={edit.applied.diff} />
          <h3>Commit message</h3>
          <pre className="message">{edit.applied.message}</pre>
          {checked.warnings.length > 0 ? (
            <>
              <h3>Warnings</h3>
              <ul className="plain">
                {checked.warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
      <div className="actions">
        {edit.ok && edit.applied.changed && errors.length === 0 && canSave ? (
          <form action={saveFootballer}>
            {Object.entries({ ...sent, qid }).flatMap(([key, value]) =>
              (Array.isArray(value) ? value : [value]).map((v, i) => (
                <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
              )),
            )}
            <button type="submit">Save</button>
          </form>
        ) : null}
        <NavLink href={changeHref}>Change the values</NavLink>
      </div>
    </section>
  );
}

function EditForm({
  qid,
  rows,
  names,
  sent,
  disabled,
}: {
  qid: string;
  rows: OverrideRow[];
  names: EditorNames;
  sent: Record<string, string | string[]> | null;
  disabled: boolean;
}) {
  const last = (name: string) => {
    const value = sent?.[name];
    return Array.isArray(value) ? value.at(-1) : value;
  };
  return (
    <form method="get" action={`/admin/footballers/${qid}`}>
      <input type="hidden" name="preview" value="1" />
      <input type="hidden" name="qid" value={qid} />
      <fieldset disabled={disabled} className="fields">
        <legend className="visually-hidden">Overrides</legend>
        {rows.map((row) => (
          <Field
            key={row.field}
            row={row}
            names={names}
            sent={sent ? last : null}
          />
        ))}
        <div className="field">
          <label htmlFor="f-note">Note</label>
          <p className="dim" id="f-note-hint">
            Why, and where it says so. Required when a value changes.
          </p>
          <textarea
            id="f-note"
            name="note"
            rows={2}
            maxLength={500}
            aria-describedby="f-note-hint"
            defaultValue={last("note") ?? ""}
          />
        </div>
      </fieldset>
      {disabled ? null : (
        <div className="actions">
          <button type="submit">Preview</button>
        </div>
      )}
    </form>
  );
}

function Field({
  row,
  names,
  sent,
}: {
  row: OverrideRow;
  names: EditorNames;
  sent: ((name: string) => string | undefined) | null;
}) {
  const id = `f-${row.field}`;
  const current = row.override ? row.override.value : row.today;
  const value = sent ? (sent(row.field) ?? "") : formValue(row.field, current);
  const known = row.override !== null || row.today !== undefined;
  const source = row.provenance;

  const today = (
    <span className="dim" data-testid={`${row.field}-source`}>
      Today: <bdi>{row.todayText}</bdi>
      {source
        ? ` · ${confidenceLabel(source.confidence)} · ${sourceLabel(source.source)}`
        : ""}
    </span>
  );
  const override = row.override ? (
    <div className="override">
      <p>
        Override in force: <strong>{row.override.text}</strong>, by{" "}
        {row.override.by} on {row.override.at}
        {row.override.note ? `: ${row.override.note}` : ""}
      </p>
      <label className="check">
        <input
          type="checkbox"
          name={`remove.${row.field}`}
          defaultChecked={sent?.(`remove.${row.field}`) === "on"}
        />
        Remove<span className="visually-hidden"> the {row.label} override</span>
      </label>
    </div>
  ) : null;

  if (row.field === "pools") {
    const pools = (current ?? {}) as { active?: boolean; legend?: boolean };
    const box = (key: "active" | "legend", label: string) => {
      const name = `pools.${key}`;
      const on = sent ? sent(name) === "on" : pools[key] === true;
      return (
        <label className="check">
          {/* Unchecked sends "off" (the checkbox, after it, wins when checked). */}
          {known ? <input type="hidden" name={name} value="off" /> : null}
          <input type="checkbox" name={name} defaultChecked={on} />
          {label}
        </label>
      );
    };
    return (
      <fieldset className="field">
        <legend>
          {row.label} {today}
        </legend>
        {override}
        <div className="checks">
          {box("active", "Active")}
          {box("legend", "Legend")}
        </div>
      </fieldset>
    );
  }

  if (row.field === "exclude" || row.field === "localStar") {
    const on = sent ? sent(row.field) === "on" : current === true;
    return (
      <div className="field">
        <div className="head">{today}</div>
        {override}
        <label className="check" htmlFor={id}>
          <input id={id} type="checkbox" name={row.field} defaultChecked={on} />
          {row.label}
        </label>
      </div>
    );
  }

  let input;
  switch (row.field) {
    case "club":
      input = (
        <select id={id} name="club" defaultValue={value}>
          {value === "" ? <option value="">unchanged</option> : null}
          <option value="none">none</option>
          {names.clubs.map(([clubQid, clubName]) => (
            <option key={clubQid} value={clubQid}>
              {clubName}
            </option>
          ))}
        </select>
      );
      break;
    case "governorate":
      input = (
        <select id={id} name="governorate" defaultValue={value}>
          {value === "" ? <option value="">unchanged</option> : null}
          <option value="none">none</option>
          {names.governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nameLatin}
            </option>
          ))}
        </select>
      );
      break;
    case "position":
      input = (
        <select id={id} name="position" defaultValue={value}>
          {value === "" ? <option value="">unchanged</option> : null}
          {lines.map((line) => (
            <option key={line} value={line}>
              {line}
            </option>
          ))}
        </select>
      );
      break;
    case "caps":
    case "goals":
      input = (
        <input
          id={id}
          name={row.field}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={value}
        />
      );
      break;
    case "capsAsOf":
    case "birthDate":
      input = (
        <input id={id} name={row.field} type="date" defaultValue={value} />
      );
      break;
    case "aliases":
      input = (
        <textarea
          id={id}
          name="aliases"
          rows={3}
          defaultValue={value}
          aria-describedby={`${id}-hint`}
        />
      );
      break;
    case "nameArabic":
      input = (
        <input
          id={id}
          name="nameArabic"
          type="text"
          dir="rtl"
          lang="ar"
          defaultValue={value}
        />
      );
      break;
    case "birthCountry":
      input = (
        <input
          id={id}
          name="birthCountry"
          type="text"
          maxLength={2}
          autoCapitalize="characters"
          aria-describedby={`${id}-hint`}
          defaultValue={value}
        />
      );
      break;
    default:
      input = (
        <input id={id} name={row.field} type="text" defaultValue={value} />
      );
  }

  return (
    <div className="field">
      <div className="head">
        <label htmlFor={id}>{row.label}</label>
        {today}
      </div>
      {override}
      {row.field === "aliases" ? (
        <p className="dim" id={`${id}-hint`}>
          One per line.
        </p>
      ) : null}
      {row.field === "birthCountry" ? (
        <p className="dim" id={`${id}-hint`}>
          Two letters, for example TN.
        </p>
      ) : null}
      {input}
    </div>
  );
}
