import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts"],
    // Unit tests never reach the network: fetch throws (src/pipeline/no-network.ts).
    setupFiles: ["src/pipeline/no-network.ts"],
    // next-intl's ESM imports "next/server" without an extension, which
    // Node's resolver refuses; Vite resolves it (src/proxy.test.ts).
    server: { deps: { inline: ["next-intl"] } },
  },
});
