// Tiny signed-cookie session for the shared-passcode gate.
// Uses Web Crypto (HMAC-SHA256) so it runs in BOTH the edge middleware and
// Node route handlers. The cookie holds a signature of a fixed payload — it
// proves "someone entered the correct passcode", nothing more (no per-user id,
// since the whole team shares one passcode).

export const SESSION_COOKIE = "ac_session";

const PAYLOAD = "authorized";
const encoder = new TextEncoder();

function sessionSecret(): string {
  // Prefer a dedicated secret; fall back to NEXTAUTH_SECRET if that's what's set.
  return (
    process.env.APP_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const b = Buffer.from(new Uint8Array(bytes));
  return b.toString("base64url");
}

async function sign(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(PAYLOAD));
  return toBase64Url(sig);
}

/** Create the session cookie value to set after a correct passcode. */
export async function createSessionToken(): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("APP_SESSION_SECRET is not set");
  return sign(secret);
}

/** Verify a session cookie value. Returns true only for a valid signature. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const expected = await sign(secret);
  // Constant-time-ish compare on equal-length base64url strings.
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
