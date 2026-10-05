import { daysBetween } from "../confidence.ts";
import type { Vote } from "../confidence.ts";
import type { FlagKind, Pool } from "../types.ts";
import type { SiteName } from "./plan.ts";
import type {
  Verdict,
  WitnessCheck,
  WitnessField,
  WitnessFile,
} from "./verdicts.ts";

// B7: what data/witness.json does in the nightly build. Read offline, no
// request. A fresh "agrees" on the value still published is one more
// agreeing vote, dated by the check (S20); a fresh "differs" is a flag and
// the field is rated low until Jalel settles it (S21 = b); a verdict older
// than 21 days (S22), or about a value we no longer publish, does nothing.
// Pure.

export const WITNESS_FRESH_DAYS = 21;

export type WitnessUse = "used" | "stale" | "changed";

/** Whether a verdict counts tonight for the value we now publish. */
export function verdictUse(
  check: WitnessCheck,
  ours: string | number | null,
  today: string,
): WitnessUse {
  if (
    check.checkedOn > today ||
    daysBetween(check.checkedOn, today) > WITNESS_FRESH_DAYS
  )
    return "stale";
  return check.checked === ours ? "used" : "changed";
}

export type WitnessDiffers = {
  field: WitnessField;
  kind: FlagKind;
  site: SiteName;
  checkedOn: string;
};

export type WitnessEvidence = {
  clubVotes: Vote<string | null>[];
  capsVotes: Vote<number>[];
  differs: WitnessDiffers[];
};

/** One footballer's verdicts against the values the merge chose for him. */
export function witnessEvidence(
  file: WitnessFile | undefined,
  qid: string,
  chosen: { clubQid: string | null; caps: number },
  today: string,
): WitnessEvidence {
  const out: WitnessEvidence = { clubVotes: [], capsVotes: [], differs: [] };
  const checks = file?.checks[qid];
  if (!checks) return out;
  const club = checks.clubId;
  if (club && verdictUse(club, chosen.clubQid, today) === "used") {
    if (club.verdict === "agrees")
      out.clubVotes.push({
        source: club.site,
        value: chosen.clubQid,
        asOf: club.checkedOn,
      });
    else if (club.verdict === "differs")
      out.differs.push({
        field: "clubId",
        kind: "club-witness-differs",
        site: club.site,
        checkedOn: club.checkedOn,
      });
  }
  const caps = checks.caps;
  if (caps && verdictUse(caps, chosen.caps, today) === "used") {
    if (caps.verdict === "agrees")
      out.capsVotes.push({
        source: caps.site,
        value: chosen.caps,
        asOf: caps.checkedOn,
      });
    else if (caps.verdict === "differs")
      out.differs.push({
        field: "caps",
        kind: "caps-witness-differs",
        site: caps.site,
        checkedOn: caps.checkedOn,
      });
  }
  return out;
}

export type WitnessSummary = {
  /** Per field and site: how many verdicts of each kind count tonight. */
  counts: {
    field: WitnessField;
    site: SiteName;
    verdicts: Record<Verdict, number>;
  }[];
  stale: number;
  /** About a value we no longer publish, or a footballer no longer in the pool. */
  unused: number;
  /** Each "differs" that counts, with our value only. */
  differs: string[];
};

/** The "Private checks (P43)" section's numbers, from the built pool. */
export function witnessSummary(
  file: WitnessFile,
  pool: Pool,
  today: string,
): WitnessSummary {
  const players = new Map(pool.players.map((p) => [p.wikidataId, p]));
  const clubs = new Map(pool.clubs.map((c) => [c.id, c]));
  const summary: WitnessSummary = {
    counts: [],
    stale: 0,
    unused: 0,
    differs: [],
  };
  const row = (field: WitnessField, site: SiteName) => {
    let r = summary.counts.find((c) => c.field === field && c.site === site);
    if (!r) {
      r = {
        field,
        site,
        verdicts: {
          agrees: 0,
          differs: 0,
          "not-found": 0,
          "not-comparable": 0,
        },
      };
      summary.counts.push(r);
    }
    return r;
  };
  for (const [qid, fields] of Object.entries(file.checks)) {
    const p = players.get(qid);
    for (const field of ["clubId", "caps"] as const) {
      const check = fields[field];
      if (!check) continue;
      if (!p) {
        summary.unused++;
        continue;
      }
      const club = p.clubId === null ? null : (clubs.get(p.clubId) ?? null);
      const ours =
        field === "caps" ? p.caps : club === null ? null : club.wikidataId;
      const use = verdictUse(check, ours, today);
      if (use === "stale") summary.stale++;
      else if (use === "changed") summary.unused++;
      else {
        row(field, check.site).verdicts[check.verdict]++;
        if (check.verdict === "differs") {
          const shown =
            field === "caps"
              ? `caps ${p.caps}${p.capsAsOf ? ` (as of ${p.capsAsOf})` : ""}`
              : `club ${club?.nameLatin ?? "none"}`;
          summary.differs.push(
            `${p.nameLatin} (${qid}): ${shown}: ${check.site} checked on ${check.checkedOn}: differs${check.reason ? ` (${check.reason})` : ""}`,
          );
        }
      }
    }
  }
  summary.counts.sort((a, b) =>
    `${a.field}|${a.site}`.localeCompare(`${b.field}|${b.site}`),
  );
  return summary;
}
