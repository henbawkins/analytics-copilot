import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Resolve the current user for API routes.
 * Returns a small user object when the request carries a valid session cookie
 * (set after entering the shared passcode), or null otherwise.
 *
 * DEV_AUTH_BYPASS=true short-circuits the gate for LOCAL development only.
 * Never enable it in production.
 */
export async function requireUser(): Promise<{ email: string } | null> {
  if (process.env.DEV_AUTH_BYPASS === "true") {
    return { email: "dev@localhost" };
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return { email: "team" };
  }
  return null;
}
