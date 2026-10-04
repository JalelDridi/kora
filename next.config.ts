import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // This is what next-intl's plugin does for us. The plugin is not used
    // because it loads @swc/core on import, which refuses to load on the
    // development machine (ERR_SWC_NATIVE_CACHE, a folder permission outside
    // the project). The browser tests fail if a next-intl upgrade changes
    // this alias.
    resolveAlias: { "next-intl/config": "./src/i18n/request.ts" },
  },
};

export default nextConfig;
