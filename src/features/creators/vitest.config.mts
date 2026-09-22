import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: [
    "src/features/creators/identity*.test.ts",
    "src/features/creators/validation.test.ts",
    "src/storage/owned-avatar.test.ts",
    "src/features/submissions/actions.test.ts",
    "src/features/submissions/upload-actions.test.ts",
    "src/features/profiles/repository.test.ts",
    "src/features/profiles/actions.test.ts",
    "src/app/api/profile/route.test.ts",
  ] },
});
