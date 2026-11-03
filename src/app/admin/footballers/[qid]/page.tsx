import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEPLOYMENT_DATA } from "@/admin/edit/commit.server";
import { footballerEdit } from "@/admin/edit/footballer";
import { diffFromMessage } from "@/admin/edit/message";
import type { DiffLine } from "@/admin/edit/overrides-patch";
import { validateEdit } from "@/admin/edit/validate";
import { STATE_FIELDS } from "@/admin/edit/fields";
import {
  editorNames,
  editorProblems,
  formRecord,
  INCLUDE_GOES,
  includeName,
  inOrOut,
  SAVE_ERRORS,
} from "@/admin/footballer-page";
import type { EditorNames } from "@/admin/footballer-page";
import { readOverrides } from "@/admin/edit/read-overrides.server";
import { REPO } from "@/admin/github";
import type { CommitInfo } from "@/admin/github";
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
  // Task 3 review, M3: a list the selects need could not be read, or does
  // not have his value: saving is off rather than a quiet "none".
  const problems = editorProblems(names, player);
  const canSave = overrides.github !== null && problems.length === 0;

  // The form's own values, when they come back from a preview. The
  // exclusion is its own form: its preview goes back to the plain page.
  const sent = formRecord(query);
  for (const name of ["preview", "saved", "error"]) delete sent[name];
  const exclusion = sent.exclude === "on";
  const returned = sent.qid === qid && !exclusion;
  const saved = one(query.saved);
  const savedSha = saved && /^[0-9a-f]{40}$/.test(saved) ? saved : null;
  const error = SAVE_ERRORS[one(query.error) ?? ""] ?? null;
  // "Saved as" only when GitHub returns the commit (Task 3 review, M6): a
  // typed or stale `?saved=` gets the link, no claim.
  const commit: CommitInfo | null =
    savedSha && overrides.github
      ? await overrides.github.getCommit(savedSha).catch(() => null)
      : null;
  const savedDiff = commit ? diffFromMessage(commit.message) : [];
  const state = inOrOut({
    qid,
    entry,
    built: player !== null || dropped !== null,
    saved: savedDiff,
  });
  // An add no build has made yet: the pool has no name for him, his
  // include commit's subject has.
  const added =
    state.state === "withdraw" && overrides.github
      ? includeName(
          await overrides.github
            .listCommits({ paths: [PATH], perPage: 30 })
            .catch(() => []),
          qid,
        )
      : undefined;
  const name = player?.nameLatin ?? dropped?.name ?? added ?? qid;
  const excluded = state.state === "excluded";
  const inOrOutSection = (
    <InOrOut
      qid={qid}
      entry={entry}
      state={state}
      name={added}
      disabled={!canSave}
    />
  );

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
      {/* Task 4 review, I2: while he is excluded, the page leads with it. */}
      {excluded ? inOrOutSection : null}
      {overrides.notice ? <p className="notice">{overrides.notice}</p> : null}
      {problems.length > 0 ? (
        <p className="notice">
          The editor could not read its lists ({problems.join("; ")}): saving is
          off.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      {savedSha ? (
        <Saved
          sha={savedSha}
          commit={commit}
          diff={savedDiff}
          joins={player === null && entry?.include?.value === true}
        />
      ) : null}
      {one(query.preview) === "1" ? (
        <Preview
          qid={qid}
          sent={sent}
          text={overrides.text}
          player={player}
          name={dropped?.name}
          names={names}
          canSave={canSave}
          back={exclusion ? `/admin/footballers/${qid}` : null}
          includeGoes={exclusion && state.includeGoes}
        />
      ) : excluded ? (
        <details className="values">
          <summary>His values (editing is off while he is excluded)</summary>
          <EditForm
            qid={qid}
            rows={rows.filter((row) => !STATE_FIELDS.includes(row.field))}
            names={names}
            sent={null}
            disabled
          />
        </details>
      ) : (
        <>
          <EditForm
            qid={qid}
            rows={rows.filter((row) => !STATE_FIELDS.includes(row.field))}
            names={names}
            sent={returned ? sent : null}
            disabled={!canSave}
          />
          {inOrOutSection}
        </>
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

/** After a save's redirect: `commit` is null when GitHub does not return it. */
function Saved({
  sha,
  commit,
  diff,
  joins,
}: {
  sha: string;
  commit: CommitInfo | null;
  diff: DiffLine[];
  /** Included and not in the deployed pool yet. */
  joins: boolean;
}) {
  const url =
    commit?.url ??
    `https://github.com/${REPO.owner}/${REPO.repo}/commit/${sha}`;
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
      {diff.length > 0 ? <Diff diff={diff} /> : null}
      <p>
        {joins
          ? "He joins the pool at the next rebuild if his data qualifies him: "
          : "The games change after a rebuild: "}
        <NavLink href="/admin/rebuild">Rebuild now</NavLink>
      </p>
    </section>
  );
}

/**
 * In the games or out (T-AD-5): exclusion is its own form, previewed like
 * any change (the preview lists every override of his that goes); an
 * exclusion in force is undone by "Include again", which removes it. An add
 * no build has made yet is withdrawn instead (Task 4 review, B1): one
 * commit removes the include, and nothing else of his goes.
 */
function InOrOut({
  qid,
  entry,
  state,
  name,
  disabled,
}: {
  qid: string;
  entry: PlayerOverride | undefined;
  state: ReturnType<typeof inOrOut>;
  /** An add's name, for the withdrawal's commit subject. */
  name: string | undefined;
  disabled: boolean;
}) {
  const since = (o: { at: string; note?: string }) =>
    `${o.at}${o.note ? ` (${o.note})` : ""}`;
  if (state.state === "excluded" && entry?.exclude)
    return (
      <section aria-labelledby="in-or-out" className="notice">
        <h2 id="in-or-out">Excluded</h2>
        <p data-testid="excluded">Excluded since {since(entry.exclude)}</p>
        {state.includeGoes ? (
          <p data-testid="include-goes">{INCLUDE_GOES}</p>
        ) : null}
        <form action={saveFootballer}>
          <input type="hidden" name="qid" value={qid} />
          <input type="hidden" name="remove.exclude" value="on" />
          <label htmlFor="f-include-why">Why include him again</label>
          <textarea
            id="f-include-why"
            name="note"
            rows={2}
            maxLength={500}
            disabled={disabled}
          />
          {disabled ? null : (
            <div className="actions">
              <button type="submit">Include again</button>
            </div>
          )}
        </form>
      </section>
    );
  const included = entry?.include?.value === true ? entry.include : null;
  if (state.state === "withdraw" && included)
    return (
      <section aria-labelledby="in-or-out" className="field">
        <h2 id="in-or-out">Withdraw the add</h2>
        <p data-testid="included">Included by search since {since(included)}</p>
        <p className="dim" id="f-withdraw-hint">
          No build has made him yet. Withdrawing removes the include: the
          nightly no longer fetches him, and nothing else of his changes.
        </p>
        <form action={saveFootballer}>
          <input type="hidden" name="qid" value={qid} />
          <input type="hidden" name="remove.include" value="on" />
          {name ? <input type="hidden" name="label" value={name} /> : null}
          <label htmlFor="f-withdraw-why">Why withdraw the add</label>
          <textarea
            id="f-withdraw-why"
            name="note"
            rows={2}
            maxLength={500}
            disabled={disabled}
            aria-describedby="f-withdraw-hint"
          />
          {disabled ? null : (
            <div className="actions">
              <button type="submit">Withdraw the add</button>
            </div>
          )}
        </form>
      </section>
    );
  return (
    <section aria-labelledby="in-or-out" className="field">
      <h2 id="in-or-out">Exclude from every game</h2>
      {included ? (
        <p data-testid="included">Included by search since {since(included)}</p>
      ) : null}
      <p className="dim" id="f-exclude-hint">
        He leaves every game at the next rebuild, and every override of his
        goes. The preview lists them.
      </p>
      <form method="get" action={`/admin/footballers/${qid}`}>
        <input type="hidden" name="preview" value="1" />
        <input type="hidden" name="qid" value={qid} />
        <input type="hidden" name="exclude" value="on" />
        <label htmlFor="f-exclude-why">Why exclude him</label>
        <textarea
          id="f-exclude-why"
          name="note"
          rows={2}
          maxLength={500}
          required
          disabled={disabled}
          aria-describedby="f-exclude-hint"
        />
        {disabled ? null : (
          <div className="actions">
            <button type="submit">Exclude from every game</button>
          </div>
        )}
      </form>
    </section>
  );
}

async function Preview({
  qid,
  sent,
  text,
  player,
  name,
  names,
  canSave,
  back,
  includeGoes,
}: {
  qid: string;
  sent: Record<string, string | string[]>;
  text: string;
  player: Parameters<typeof footballerEdit>[0]["player"];
  /** His name when the pool has none (left out). */
  name: string | undefined;
  names: EditorNames;
  canSave: boolean;
  /** Where "Change the values" goes when it is not the filled form. */
  back: string | null;
  /** The exclusion removes the include he was added by (Task 4 review, I1). */
  includeGoes: boolean;
}) {
  const edit = await footballerEdit({
    form: { ...sent, qid },
    text,
    player,
    names,
    today: tunisDay(new Date()),
    ...(name ? { name } : {}),
  });
  const checked =
    edit.ok && edit.applied.changed
      ? await validateEdit(PATH, edit.applied.text, DEPLOYMENT_DATA)
      : { errors: [], warnings: [] };
  const errors = edit.ok ? checked.errors : edit.errors;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sent))
    for (const v of Array.isArray(value) ? value : [value])
      query.append(key, v);
  query.set("qid", qid);
  const changeHref = back ?? `/admin/footballers/${qid}?${query}`;

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
          {includeGoes ? (
            <p className="notice" data-testid="include-goes">
              {INCLUDE_GOES}
            </p>
          ) : null}
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
