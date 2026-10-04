import type { Confederation } from "./types.ts";

export const TUNISIA_TEAM = "Q27971";
export const LIGUE1 = "Q794235";

export function plainLatin(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function slugify(text: string): string {
  return plainLatin(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GOVERNORATES = [
  "tunis",
  "ariana",
  "ben arous",
  "manouba",
  "nabeul",
  "zaghouan",
  "bizerte",
  "beja",
  "jendouba",
  "kef",
  "siliana",
  "sousse",
  "monastir",
  "mahdia",
  "sfax",
  "kairouan",
  "kasserine",
  "sidi bouzid",
  "gabes",
  "medenine",
  "tataouine",
  "gafsa",
  "tozeur",
  "kebili",
];

/** "Le Kef Governorate" → "kef". Null for anything that is not one of the 24. */
export function governorateSlug(label: string): string | null {
  const key = plainLatin(label)
    .replace(/\bgovernorate\b/, "")
    .replace(/[-\s]+/g, " ")
    .trim()
    .replace(/^(?:le|la|el) /, "");
  return GOVERNORATES.includes(key) ? key.replace(/ /g, "-") : null;
}

// FIFA members by confederation (ISO 3166-1 alpha-2), plus territories whose
// clubs play in a member's league (Monaco, Réunion, the French Caribbean).
const MEMBERS: Record<Confederation, string> = {
  UEFA: "AD AL AM AT AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GI GR HR HU IE IL IS IT KZ LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA XK",
  CAF: "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW",
  AFC: "AE AF AU BD BH BN BT CN GU HK ID IN IQ IR JO JP KG KH KP KR KW LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TW UZ VN YE",
  CONCACAF:
    "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GF GP GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PR SR SV SX TC TT US VC VG VI",
  CONMEBOL: "AR BO BR CL CO EC PE PY UY VE",
  OFC: "AS CK FJ NC NZ PF PG SB TO VU WS",
};

const BY_COUNTRY = new Map<string, Confederation>(
  (Object.entries(MEMBERS) as [Confederation, string][]).flatMap(
    ([confederation, codes]) =>
      codes
        .split(" ")
        .map((code) => [code, confederation] as [string, Confederation]),
  ),
);

export function confederationOf(iso: string | null): Confederation | null {
  return iso === null ? null : (BY_COUNTRY.get(iso) ?? null);
}
