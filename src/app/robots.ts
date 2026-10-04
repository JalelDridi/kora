import type { MetadataRoute } from "next";
import { site } from "@/site";

// /admin is not listed: it carries noindex, and naming it here would both
// advertise it and stop crawlers from reading that noindex (decision H16).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
