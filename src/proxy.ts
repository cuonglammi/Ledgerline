import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: if there's no session cookie at all, send the visitor to sign in
 * before rendering anything. The real check (is the session valid? which workspace?) happens
 * in requireOrg() on the server, next to the data.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/inbox/:path*", "/invoices/:path*", "/onboarding"],
};
