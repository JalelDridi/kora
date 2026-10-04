// Who may open /admin/*: anyone who sends ADMIN_PASSWORD with HTTP Basic auth
// (decision P16). The user name is ignored. Without a password of 16
// characters or more set, the pages do not exist. The pool is public in the
// repository anyway; this keeps an unfinished tool away from visitors and
// search engines. Pure, so src/proxy.ts only applies it.

export type AdminAccess = "allow" | "challenge" | "not-found";

export const MIN_PASSWORD_LENGTH = 16;

/** Takes the same time whatever the first difference is. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/** The "user:password" a Basic header carries, read as UTF-8; null when malformed. */
function basicCredentials(authorization: string | null): string | null {
  const match = /^Basic\s+(\S+)$/i.exec(authorization?.trim() ?? "");
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function adminAccess(
  authorization: string | null,
  password: string | undefined,
): AdminAccess {
  if (!password || password.length < MIN_PASSWORD_LENGTH) return "not-found";
  const credentials = basicCredentials(authorization);
  // RFC 7617: the user name ends at the first colon; the password may hold more.
  const colon = credentials?.indexOf(":") ?? -1;
  if (credentials === null || colon === -1) return "challenge";
  return constantTimeEqual(credentials.slice(colon + 1), password)
    ? "allow"
    : "challenge";
}
