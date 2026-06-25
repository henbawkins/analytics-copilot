import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  // If no allowlist is configured, deny by default in production.
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Gate sign-in on the allowlist — this is the team access control.
    async signIn({ user }) {
      return isAllowed(user.email);
    },
  },
  pages: { signIn: "/signin" },
};

/**
 * Resolve the current user for API routes.
 * Returns an object with the email, or null if unauthenticated/not allowed.
 *
 * DEV_AUTH_BYPASS=true short-circuits auth for LOCAL development only so the
 * app is usable before Google OAuth is configured. Never enable in production.
 */
export async function requireUser(): Promise<{ email: string } | null> {
  if (process.env.DEV_AUTH_BYPASS === "true") {
    return { email: "dev@localhost" };
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!isAllowed(email)) return null;
  return { email: email as string };
}
