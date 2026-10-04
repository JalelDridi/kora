import type { NextConfig } from "next";

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
  outputFileTracingIncludes: { "/admin/**": ["./data/pool.json"] },
};

export default nextConfig;
