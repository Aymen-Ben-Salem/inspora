import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const result = config({ path: ".env.production.local" });

if (result.error) {
  throw new Error(
    "Could not load .env.production.local. Create it with the production Neon variables before running a production migration.",
  );
}

const migrationUrl = process.env.DATABASE_URL_UNPOOLED;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is required in .env.production.local for production migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url: migrationUrl },
});
