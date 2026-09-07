import { defineConfig } from "drizzle-kit";

import { loadPreviewEnvironment } from "./scripts/lib/preview-environment";

const environment = loadPreviewEnvironment();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url: environment.databaseUrlUnpooled },
});
