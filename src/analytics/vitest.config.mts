import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
  test: {
    include: [
      "src/analytics/creator-views.test.ts",
      "src/analytics/work-session.test.ts",
      "src/analytics/privacy.test.ts",
      "src/analytics/privacy-controls.test.ts",
      "src/components/work-analytics.test.ts",
      "src/components/profile/profile-header.interaction.test.tsx",
      "src/features/profiles/integration.test.ts",
      "src/app/api/creators/[id]/views/route.test.ts",
    ],
  },
});
