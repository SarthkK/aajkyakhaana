import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Gates the signed-in app at the edge, so the pages behind it never have to.
 *
 * This exists for speed, not just tidiness. The layout used to read the session
 * cookie, which made every page under it dynamic — so each tab switch was a server
 * round trip (~600ms) before anything appeared, and prefetching could not help because
 * dynamic routes are not cached. With the cookie read moved here, those pages are
 * static, prefetched, and switch instantly; the session arrives separately over an
 * API call the client caches.
 *
 * Only the signature is checked. Whether the account still exists, and which flat it
 * belongs to, is settled by /api/auth/me — which the app has to call anyway.
 */
const SESSION_COOKIE = "kk_session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token && process.env.JWT_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
      return NextResponse.next();
    } catch {
      // Expired or tampered with — treated as signed out.
    }
  }

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // Only the signed-in screens. Everything else — auth pages, the API, static files —
  // handles its own access, and keeping the matcher narrow keeps invocations down.
  matcher: ["/today/:path*", "/plan/:path*", "/chat/:path*", "/dishes/:path*", "/shopping/:path*", "/me/:path*", "/day/:path*"],
};
