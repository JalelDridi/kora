import { describe, expect, it } from "vitest";
import { goalsFloors, tunisiaScorers } from "./goalscorers.ts";
import type { WdPlayer } from "./types.ts";

// A hand-made sample with martj42's goalscorers.csv header; nothing is fetched.
const csv = [
  "date,home_team,away_team,team,scorer,minute,own_goal,penalty",
  "2022-11-30,Tunisia,France,Tunisia,Wahbi Khazri,58,FALSE,FALSE",
  "2019-06-24,Tunisia,Angola,Tunisia,Youssef Msakni,34,FALSE,TRUE",
  "2019-06-24,Tunisia,Angola,Angola,Djalma,72,FALSE,FALSE",
  "2018-06-28,Panama,Tunisia,Tunisia,Yassine Meriah,33,TRUE,FALSE",
  "2016-01-01,Tunisia,X,Tunisia,Wahbi Khazri,10,FALSE,FALSE",
].join("\n");
const wd = (qid: string, nameEn: string, aliases: string[] = []) =>
  ({ qid, nameEn, nameFr: null, aliases }) as unknown as WdPlayer;

describe("goalscorers", () => {
  it("counts Tunisia's goals per scorer, without own goals", () =>
    expect(tunisiaScorers(csv)).toEqual([
      ["wahbi khazri", 2],
      ["youssef msakni", 1],
    ]));
  it("gives a floor only to the one footballer who answers to the name", () =>
    expect(
      Object.fromEntries(
        goalsFloors(tunisiaScorers(csv), [
          wd("Q27794", "Wahbi Khazri"),
          wd("Q2409513", "Youssef Msakni"),
          wd("Q9", "Other", ["Youssef Msakni"]),
        ]),
      ),
    ).toEqual({ Q27794: 2 }));
  // Not in the addendum: a file without the needed columns must fail loudly.
  it("refuses a file without team, scorer and own_goal columns", () =>
    expect(() => tunisiaScorers("date,home_team\n2020-01-01,Tunisia")).toThrow(
      "goalscorers.csv lacks team, scorer or own_goal",
    ));
});
