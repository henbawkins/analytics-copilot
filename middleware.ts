import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Gate the app UI behind auth. The /api/chat route does its own check too
// (defense in depth). DEV_AUTH_BYPASS=true disables the gate for local dev.
export async function middleware(req: NextRequest) {
  if (process.env.DEV_AUTH_BYPASS === "true") return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = new URL("/signin", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protect the home page only. Auth routes, sign-in page, and static assets
// must stay public.
export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)"],
};
