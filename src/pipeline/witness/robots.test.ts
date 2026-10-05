import { describe, expect, it } from "vitest";
import { isAllowed, NO_ROBOTS, parseRobots } from "./robots.ts";

// Synthetic robots files built on the lines the research quotes
// (data-sources-2a-apis-and-sites.md §2.3): national-football-teams.com asks
// "Crawl-delay: 60" and blocks sort permutations and /old/; Transfermarkt
// allows everything to "*" and disallows wget.

const nft = `# synthetic, after the research's quotes
User-agent: *
Crawl-delay: 60
Disallow: /*?sort=
Disallow: /old/
`;
const tm = `User-agent: wget
Disallow: /

User-agent: *
Allow: /
`;

describe("parseRobots and isAllowed", () => {
  it("reads Crawl-delay 60 for *", () => {
    expect(parseRobots(nft, "KoraWitness").crawlDelaySec).toBe(60);
    expect(parseRobots(tm, "KoraWitness").crawlDelaySec).toBeNull();
  });

  it("finds a disallowed path", () => {
    const robots = parseRobots(nft, "KoraWitness");
    expect(isAllowed(robots, "/old/player/1.html")).toBe(false);
    expect(
      isAllowed(robots, "/country/190/2026/Tunisia.html?sort=player.surname"),
    ).toBe(false);
    expect(isAllowed(robots, "/country/190/2026/Tunisia.html")).toBe(true);
    expect(isAllowed(robots, "/player/1/A_B.html")).toBe(true);
    // Transfermarkt's wget group is not ours; "*" allows all.
    expect(isAllowed(parseRobots(tm, "KoraWitness"), "/x")).toBe(true);
    expect(isAllowed(parseRobots(tm, "wget"), "/x")).toBe(false);
  });

  it("takes the group that names our agent over *", () => {
    const text = `User-agent: *\nDisallow:\n\nUser-agent: KoraWitness\nDisallow: /\nCrawl-delay: 5\n`;
    const robots = parseRobots(text, "KoraWitness");
    expect(robots.crawlDelaySec).toBe(5);
    expect(isAllowed(robots, "/anything")).toBe(false);
  });

  it("no robots file means no extra rules", () => {
    expect(parseRobots("", "KoraWitness")).toEqual(NO_ROBOTS);
    expect(isAllowed(NO_ROBOTS, "/any/path")).toBe(true);
  });
});
