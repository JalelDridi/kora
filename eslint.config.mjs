import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Node runs these files directly by stripping types; a type imported
    // without `import type` would be a missing export at runtime.
    files: ["src/pipeline/**/*.ts", "src/engine/**/*.ts"],
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
  {
    // Public code never imports the admin (decision P60): its GitHub client
    // and edit modules stay out of the visitors' bundles. Everything under
    // src/ is public except the admin itself. The one exception is
    // src/admin/access.ts: pure, no secret, shared with the proxy and the
    // nightly route's constant-time comparison (src/chkoun/nightly.ts). Only
    // that exact module: "@/admin/access/../github" is still refused.
    files: ["src/**"],
    ignores: ["src/admin/**", "src/app/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/admin/*",
                "**/admin/*",
                "@/admin/*/**",
                "**/admin/*/**",
                "!@/admin/access",
                "!./admin/access",
              ],
              message: "Public code must not import the admin (decision P60).",
            },
          ],
          paths: [
            {
              name: "@/admin",
              message: "Public code must not import the admin (decision P60).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "test-results/**",
    "playwright-report/**",
    ".lighthouseci/**",
  ]),
]);

export default eslintConfig;
