// robots.txt, as far as the witness needs it (B2): the group for our agent
// (or "*"), its Crawl-delay and its Allow and Disallow rules. Pure.

export type Robots = {
  /** Seconds between requests the site asks for; null when it asks none. */
  crawlDelaySec: number | null;
  rules: { allow: boolean; path: string }[];
};

export const NO_ROBOTS: Robots = { crawlDelaySec: null, rules: [] };

/**
 * The rules for `agent` (its product token, e.g. "KoraWitness"): the group
 * naming it, else the "*" group, else none.
 */
export function parseRobots(text: string, agent: string): Robots {
  type Group = { agents: string[]; robots: Robots };
  const groups: Group[] = [];
  let current: Group | null = null;
  let inAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !inAgents) {
        current = { agents: [], robots: { crawlDelaySec: null, rules: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!current) continue;
    if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0)
        current.robots.crawlDelaySec = seconds;
    } else if (key === "allow" || key === "disallow") {
      // "Disallow:" with no path allows everything: no rule.
      if (value !== "")
        current.robots.rules.push({ allow: key === "allow", path: value });
    }
  }
  const token = agent.toLowerCase();
  const mine = groups.find((g) =>
    g.agents.some((a) => a !== "*" && token.includes(a)),
  );
  return (
    (mine ?? groups.find((g) => g.agents.includes("*")))?.robots ?? NO_ROBOTS
  );
}

function matches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** The longest matching rule decides; Allow wins a tie; no rule allows. */
export function isAllowed(robots: Robots, path: string): boolean {
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of robots.rules) {
    if (!matches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow))
      best = { allow: rule.allow, length };
  }
  return best?.allow ?? true;
}
