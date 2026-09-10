import { defineConfig } from "drizzle-kit";

import { loadDevelopmentMediaEnvironment } from "./scripts/lib/development-environment";

const environment = loadDevelopmentMediaEnvironment();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url: environment.databaseUrlUnpooled },
});
