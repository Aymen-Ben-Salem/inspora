import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";
import { previewEnvironmentFromValues } from "../../../scripts/lib/preview-environment";
if (process.env.RUN_SPONSORSHIP_PREVIEW_TESTS !== "1")
  throw new Error("Explicit preview sponsorship rehearsal opt-in required.");
const values = parse(
  readFileSync(".scratch/sponsorship/.env.ticket01-rehearsal", "utf8"),
);
previewEnvironmentFromValues(values);
if (
  !/^\/sponsorship_ticket01_[a-f0-9]{32}$/.test(
    new URL(values.DATABASE_URL).pathname,
  )
)
  throw new Error("Disposable preview database required.");
Object.assign(process.env, values);
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
  },
  test: {
    pool: "threads",
    include: ["src/features/sponsorship/*.preview.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
