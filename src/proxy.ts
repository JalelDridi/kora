import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { adminAccess } from "./admin/access";
import { routing } from "./i18n/routing";

// Redirects / to the default locale and maps /ar, /tn and /fr to their
// locale ids. /admin is English, outside the locales, and behind a password
// (decision P16): next-intl never sees it.
const intl = createMiddleware(routing);

const PRIVATE = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

const isAdmin = (pathname: string) =>
  pathname === "/admin" || pathname.startsWith("/admin/");

export default function proxy(request: NextRequest) {
  if (!isAdmin(request.nextUrl.pathname)) return intl(request);

  const access = adminAccess(
    request.headers.get("authorization"),
    process.env.ADMIN_PASSWORD,
  );
  if (access === "not-found") {
    return new NextResponse("Not found", { status: 404, headers: PRIVATE });
  }
  if (access === "challenge") {
    return new NextResponse("Password required", {
      status: 401,
      headers: {
        ...PRIVATE,
        "WWW-Authenticate": 'Basic realm="Kora admin", charset="UTF-8"',
      },
    });
  }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(PRIVATE)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Everything except route handlers, Next's own files and files with an
  // extension; and everything under /admin, files included, so nothing of
  // the review pages can be fetched around the password.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/admin", "/admin/:path*"],
};
