import { gamePageData } from "@/chkoun/page-data.server";
import { isLocale, locales } from "@/i18n/locales";

// The game's name list and label tables, one static JSON file per locale
// (/chkoun-data/ar-TN.json), built with the page from data/pool.json. The
// page loads it after its first paint instead of carrying it in its HTML,
// so the shell hydrates light. Like the page, it holds every guessable
// footballer alike and nothing about the day's answer.

export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map((locale) => ({ file: `${locale}.json` }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/chkoun-data/[file]">,
) {
  const { file } = await params;
  const locale = file.replace(/\.json$/, "");
  if (!file.endsWith(".json") || !isLocale(locale))
    return new Response("Not found", { status: 404 });
  return Response.json(await gamePageData(locale));
}
