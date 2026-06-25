import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Gate the app UI behind the shared passcode. The /api/chat route also checks
// (defense in depth). DEV_AUTH_BYPASS=true disables the gate for local dev.
export async function middleware(req: NextRequest) {
  if (process.env.DEV_AUTH_BYPASS === "true") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/signin", req.url));
}

// Protect everything except the sign-in page, the login/logout API, and static
// assets, which must stay reachable.
export const config = {
  matcher: [
    "/((?!api/login|api/logout|signin|_next/static|_next/image|favicon.ico).*)",
  ],
};
