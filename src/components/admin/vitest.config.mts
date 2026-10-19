import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: [
    "src/components/admin/editor-persistence.test.tsx",
    "src/components/admin/video-crop-dialog.test.tsx",
    "src/components/admin/website-video-crop.test.tsx",
    "src/components/admin/website-favicon-crop.test.tsx",
    "src/features/admin/image-crop.test.ts",
  ] },
});
