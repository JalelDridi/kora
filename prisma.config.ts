import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Values already in the environment win (Vercel, CI), then .env.local, then
// the local Docker defaults.
config({ path: [".env.local", ".env.development"], quiet: true });

// Migrations need a direct connection; the pooled URL is for the app.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
