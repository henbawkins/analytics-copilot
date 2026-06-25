import { SESSION_COOKIE, createSessionToken } from "@/lib/session";

export const runtime = "nodejs";

// Verify the shared passcode and, on success, set the signed session cookie.
export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return Response.json(
      { error: "APP_PASSWORD is not configured on the server." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (password !== expected) {
    return Response.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = Response.json({ ok: true });
  res.headers.append(
    "set-cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
      // 30-day session
      `Max-Age=${60 * 60 * 24 * 30}`,
    ].join("; "),
  );
  return res;
}
