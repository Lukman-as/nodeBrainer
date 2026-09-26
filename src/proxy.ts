import { NextRequest, NextResponse } from "next/server";
import { getAuth0, isAuthConfigured } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  if (!isAuthConfigured()) {
    if (request.nextUrl.pathname.startsWith("/auth/")) {
      return NextResponse.redirect(new URL("/setup", request.url));
    }
    return NextResponse.next();
  }
  return getAuth0().middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
