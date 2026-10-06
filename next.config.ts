import type { NextConfig } from "next";
import { posthogEuHost } from "./src/analytics/hosts.ts";
import { securityHeaders } from "./src/security-headers.ts";

const nextConfig: NextConfig = {
  turbopack: {
    // This is what next-intl's plugin does for us. The plugin is not used
    // because it loads @swc/core on import, which refuses to load on the
    // development machine (ERR_SWC_NATIVE_CACHE, a folder permission outside
    // the project). The browser tests fail if a next-intl upgrade changes
    // this alias. It is set for Turbopack only: a webpack build
    // (`next build --webpack`) would need the same alias under `webpack`.
    resolveAlias: { "next-intl/config": "./src/i18n/request.ts" },
  },
  // The admin pages read data/pool.json at request time (src/admin/load-pool.ts);
  // this puts the file in their serverless bundle on Vercel.
  // The game's API reads the same file and the governorates
  // (src/chkoun/attributes.server.ts).
  outputFileTracingIncludes: {
    "/admin/**": ["./data/pool.json"],
    "/api/chkoun/**": ["./data/pool.json", "./data/curated/*.json"],
  },
  // Every response, the admin pages included (src/security-headers.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          analyticsHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || posthogEuHost,
          dev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
