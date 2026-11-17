import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: {
    // All opt-in Neon suites share one guarded fixture; serialize files while
    // individual concurrency cases still use independent database connections.
    fileParallelism: process.env.PRO_TEST_BACKEND !== "neon",
    testTimeout: process.env.PRO_TEST_BACKEND === "neon" ? 30_000 : 5000,
    hookTimeout: process.env.PRO_TEST_BACKEND === "neon" ? 60_000 : 10_000,
    pool: "threads",
    include: [
      "src/features/pro/**/*.test.ts",
      "src/components/pro/**/*.test.tsx",
      "src/features/inspora-catalog/mcp-authorization.test.ts",
      "src/app/api/internal/pro/**/*.test.ts",
      "src/app/api/webhooks/stripe-pro/**/*.test.ts",
      "src/features/profiles/account-lifecycle.test.ts",
      "src/features/submissions/cleanup.test.ts",
      "scripts/lib/environment-fingerprint.test.ts",
      "scripts/lib/sponsorship-environment.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/.scratch/**"],
  },
});
