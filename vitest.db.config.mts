import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that need a real Postgres (see docker-compose.yml). They share one
// database, so files run one at a time.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves "server-only" itself (no package); on the server it
      // is this empty module, so tests load it the same way.
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["src/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
