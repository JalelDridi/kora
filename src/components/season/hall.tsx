import { format } from "@/chkoun/labels";
import type { DeviceSeason } from "@/season/device";
import type { SeasonStrings } from "./island";

type Props = {
  seasons: DeviceSeason[];
  /** "/ar", "/tn" or "/fr": each season opens its replay. */
  prefix: string;
  strings: SeasonStrings;
};

// The visitor's best seasons, kept on this device (plan Task 11): a table
// read from bestSeasons(), most points first. Nothing when there is none.
export function Hall({ seasons, prefix, strings: t }: Props) {
  if (seasons.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <table className="w-full border-separate border-spacing-y-1 text-start text-base">
        <caption className="text-start">
          <span className="block text-xl font-bold">{t.hall.title}</span>
          <span className="block text-sm text-chalk-dim">{t.hall.note}</span>
        </caption>
        <thead>
          <tr className="text-sm text-chalk-dim">
            <th scope="col" className="px-2 text-start font-normal">
              {t.hall.record}
            </th>
            <th scope="col" className="px-2 text-start font-normal">
              {t.hall.points}
            </th>
            <th scope="col" className="px-2 text-start font-normal">
              {t.hall.rating}
            </th>
            <th scope="col" className="px-2 text-start font-normal">
              {t.hall.day}
            </th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={`${s.at}|${s.xi}`} className="bg-pitch-800">
              <th
                scope="row"
                className="rounded-s-lg px-2 py-2 text-start font-extrabold"
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
              <td data-hall-points="" className="px-2 py-2">
                {s.points}
              </td>
              <td className="px-2 py-2">{s.rating.toFixed(1)}</td>
              <td className="rounded-e-lg px-2 py-2 whitespace-nowrap">
                <bdi dir="ltr">{s.day}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
