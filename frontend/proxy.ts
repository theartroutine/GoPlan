import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = ["/login", "/register", "/verify-email", "/setup-profile", "/forgot-password", "/reset-password"];
const PUBLIC_PAGES = ["/share/memories/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasRefreshToken = request.cookies.has("refresh_token");
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isPublicPage = PUBLIC_PAGES.some((path) => pathname.startsWith(path));

  // Not logged in -> redirect to login for protected pages
  if (!isAuthPage && !isPublicPage && !hasRefreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
