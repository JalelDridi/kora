import "server-only";
import { headers } from "next/headers";
import { adminAccess } from "./access.ts";

/**
 * A server action is a public POST endpoint: each dashboard action checks
 * the admin password itself before anything else (the proxy checks it too).
 * Not a "use server" module, so this is not an action of its own.
 */
export async function requireAdmin(): Promise<void> {
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, process.env.ADMIN_PASSWORD) !== "allow")
    throw new Error("Not found");
}
