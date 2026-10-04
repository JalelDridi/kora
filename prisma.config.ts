import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// On Vercel the environment is the only source: the committed
// .env.development would otherwise fill in a localhost DATABASE_URL_UNPOOLED
// and send migrations to it. Elsewhere, values already in the environment win
// (CI), then .env.local, then the local Docker defaults.
if (!process.env.VERCEL) {
  config({ path: [".env.local", ".env.development"], quiet: true });
}

// Migrations need a direct connection; the pooled URL is for the app.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
