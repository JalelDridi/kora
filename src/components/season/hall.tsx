import { format } from "@/chkoun/labels";
import type { DeviceSeason } from "@/season/device";
import type { SeasonStrings } from "./island";

type Props = {
  seasons: DeviceSeason[];
  /** "/ar", "/tn" or "/fr": each season opens its replay. */
  prefix: string;
  strings: SeasonStrings;
  /** In the record dialog (mobile polish M3): narrower cells, smaller type. */
  compact?: boolean;
};

// The visitor's best seasons, kept on this device (plan Task 11): a table
// read from bestSeasons(), most points first. Nothing when there is none.
export function Hall({ seasons, prefix, strings: t, compact = false }: Props) {
  if (seasons.length === 0) return null;
  // A cell's inline padding; the dialog is narrower than the page.
  const px = compact ? "px-1" : "px-2";
  return (
    <section
      className={
        compact ? "flex flex-col gap-2 overflow-x-auto" : "flex flex-col gap-2"
      }
    >
      <table
        className={`w-full border-separate border-spacing-y-1 text-start ${compact ? "text-sm" : "text-base"}`}
      >
        <caption className="text-start">
          <span className="block text-xl font-bold">{t.hall.title}</span>
          <span className="block text-sm text-chalk-dim">{t.hall.note}</span>
        </caption>
        <thead>
          <tr className="text-sm text-chalk-dim">
            <th scope="col" className={`${px} text-start font-normal`}>
              {t.hall.record}
            </th>
            <th scope="col" className={`${px} text-start font-normal`}>
              {t.hall.points}
            </th>
            <th scope="col" className={`${px} text-start font-normal`}>
              {t.hall.rating}
            </th>
            <th scope="col" className={`${px} text-start font-normal`}>
              {t.hall.day}
            </th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={`${s.at}|${s.xi}`} className="bg-pitch-800">
              <th
                scope="row"
                className={`rounded-s-lg ${px} py-2 text-start font-extrabold${compact ? " whitespace-nowrap" : ""}`}
              >
                <a
                  href={`${prefix}/season/r/${s.day}/${s.xi}`}
                  className="text-mint underline"
                >
                  <bdi dir="ltr">
                    {format(t.result.record, { w: s.w, d: s.d, l: s.l })}
                  </bdi>
                </a>
              </th>
              <td data-hall-points="" className={`${px} py-2`}>
                {s.points}
              </td>
              <td className={`${px} py-2`}>{s.rating.toFixed(1)}</td>
              <td
                className={`rounded-e-lg ${px} py-2${compact ? "" : " whitespace-nowrap"}`}
              >
                {compact ? (
                  // At 320 px the year may go on its own line: "2026-",
                  // then "10-31". The other cells keep one line each.
                  <bdi dir="ltr">
                    <span className="whitespace-nowrap">
                      {s.day.slice(0, 5)}
                    </span>
                    <wbr />
                    <span className="whitespace-nowrap">{s.day.slice(5)}</span>
                  </bdi>
                ) : (
                  <bdi dir="ltr">{s.day}</bdi>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
