import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRouteAllowed, DEFAULT_PAGE } from "./lib/permissions";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, logos, favicon, public assets, and video feed stream.
  // /video_feed is excluded because it's an MJPEG stream loaded by <img> tags
  // and authenticated via ?token= query param directly on the Flask backend.
  // If middleware intercepts it, the <img> receives a 307 redirect → black screen.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/logos") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/icon.png") ||
    pathname.startsWith("/video_feed") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session_token")?.value;
  const role = request.cookies.get("user_role")?.value;

  if (pathname === "/login") {
    if (token && role) {
      const defaultPage = DEFAULT_PAGE[role] || "/live-monitoring";
      return NextResponse.redirect(new URL(defaultPage, request.url));
    }
    return NextResponse.next();
  }

  // Protected route check
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!role) {
    // Missing role information, force re-authentication
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session_token");
    response.cookies.delete("user_role");
    return response;
  }

  // Check route-to-role permissions mapping from lib/permissions.ts
  if (!isRouteAllowed(role, pathname)) {
    const defaultPage = DEFAULT_PAGE[role] || "/live-monitoring";
    return NextResponse.redirect(new URL(defaultPage, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all routes except public assets and Next.js internal endpoints
  matcher: [
    "/((?!api|video_feed|_next/static|_next/image|favicon.ico|icon.png|logos|.*\\..*).*)",
  ],
};
