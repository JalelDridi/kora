import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// On a Vercel build (production or preview) the environment is the only
// source: the committed .env.development would otherwise fill in a localhost
// DATABASE_URL_UNPOOLED and send migrations to it. Elsewhere, `vercel dev`
// included (VERCEL=1 alone), values already in the environment win (CI), then
// .env.local, then the local Docker defaults. The same test as isVercelBuild
// in src/pipeline/database-url.ts.
const vercelBuild =
  process.env.VERCEL === "1" &&
  (process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview");
if (!vercelBuild) {
  config({ path: [".env.local", ".env.development"], quiet: true });
}

// Migrations need a direct connection; the pooled URL is for the app.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
