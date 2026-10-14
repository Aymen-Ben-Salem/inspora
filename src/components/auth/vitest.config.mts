import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: {
    include: [
      "src/components/auth/auth-dismissal.interaction.test.tsx",
      "src/components/auth/auth-modal-shell.test.tsx",
      "src/components/auth/public-auth-controls.test.tsx",
      "src/components/auth/public-auth-controls-client.test.tsx",
      "src/components/auth/mobile-submission.interaction.test.tsx",
      "src/components/auth/public-auth-page.test.tsx",
      "src/components/auth/public-auth-destinations.test.tsx",
      "src/components/saved-posts-provider.test.tsx",
      "src/components/submissions/submission-state.test.ts",
      "src/components/post-dialog.test.tsx",
      "src/lib/post-dialog-history.test.ts",
    ],
  },
});
