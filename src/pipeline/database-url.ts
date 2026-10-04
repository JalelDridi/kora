// Which database a command may use, decided before any connection. Pure.
// The local-database guard lives here, not in src/db, because Node runs the
// sync by stripping types and cannot load src/db (its imports have no
// extension); src/db/testing.ts re-exports it for the database tests.

// Database tests truncate tables. Refuse to run against anything but a
// local Postgres so a misconfigured environment cannot wipe a real database.
export function assertLocalDatabase(url: string): void {
  const { hostname, search } = new URL(url);
  // The pg driver copies query parameters into its config, and ?host= or
  // ?hostaddr= override the hostname checked below. Allow none at all.
  if (search !== "") {
    throw new Error(
      "Refusing to run database tests against a URL with a query string",
    );
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to run database tests against non-local host "${hostname}"`,
    );
  }
}

/** The host as it may be printed: the first label, which names the database, hidden. */
export function maskHost(hostname: string): string {
  const dot = hostname.indexOf(".");
  return dot === -1 ? hostname : `***${hostname.slice(dot)}`;
}

export type DatabaseTarget =
  { ok: true; url: string; host: string } | { ok: false; reason: string };

/**
 * The database the build steps use: DATABASE_URL_UNPOOLED, else DATABASE_URL,
 * as prisma.config.ts chooses for the migrations. Outside Vercel only a local
 * database is accepted, unless KORA_SYNC_ALLOW_REMOTE=1 says otherwise, so
 * nobody writes to a hosted database from a laptop by accident. Reasons never
 * contain the URL.
 */
export function databaseTarget(
  env: Record<string, string | undefined>,
): DatabaseTarget {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url)
    return {
      ok: false,
      reason: "DATABASE_URL_UNPOOLED or DATABASE_URL must be set",
    };
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { ok: false, reason: "the database URL cannot be parsed" };
  }
  const host = maskHost(hostname);
  const remoteAllowed =
    env.VERCEL === "1" || env.KORA_SYNC_ALLOW_REMOTE === "1";
  if (!remoteAllowed) {
    try {
      assertLocalDatabase(url);
    } catch {
      return {
        ok: false,
        reason: `refusing ${host}: outside Vercel only a local database without a query string is used (set KORA_SYNC_ALLOW_REMOTE=1 to override)`,
      };
    }
  }
  return { ok: true, url, host };
}
