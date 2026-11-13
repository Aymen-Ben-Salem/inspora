import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: ["src/features/admin/editorial*.test.ts", "src/components/admin/editorial*.test.tsx",
    "src/features/admin/post-validation.test.ts", "src/features/admin/logo-validation.test.ts", "src/features/admin/website-validation.test.ts",
    "src/features/admin/posts-repository.test.ts", "src/features/admin/logos-repository.test.ts", "src/features/admin/websites-save-repository.test.ts",
    "src/features/admin/posts-actions.test.ts", "src/features/admin/logo-website-actions.test.ts",
    "src/features/inspora-catalog/source.test.ts", "src/components/admin/editor-persistence.test.tsx"] },
});
