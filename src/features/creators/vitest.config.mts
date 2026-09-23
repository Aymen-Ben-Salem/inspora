import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: [
    "src/features/creators/identity*.test.ts",
    "src/features/creators/claims*.test.ts",
    "src/features/creators/validation.test.ts",
    "src/features/admin/creator-actions.test.ts",
    "src/features/admin/creator-environment-policy.test.ts",
    "src/features/admin/posts-repository.preview.test.ts",
    "src/features/admin/posts-repository.test.ts",
    "src/features/admin/posts-actions.test.ts",
    "src/features/admin/logos-repository.test.ts",
    "src/features/admin/websites-repository.test.ts",
    "src/features/admin/websites-save-repository.test.ts",
    "src/features/admin/logo-website-actions.test.ts",
    "src/features/admin/logo-website-repository.preview.test.ts",
    "src/storage/owned-avatar.test.ts",
    "src/features/submissions/actions.test.ts",
    "src/features/submissions/upload-actions.test.ts",
    "src/features/profiles/repository.test.ts",
    "src/features/profiles/actions.test.ts",
    "src/app/api/profile/route.test.ts",
    "src/app/profile/page.test.tsx",
  ] },
});
