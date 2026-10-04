import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Redirects / to the default locale and maps /ar, /tn and /fr to their
// locale ids.
export default createMiddleware(routing);

export const config = {
  // Everything except route handlers, Next's own files and files with an
  // extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
