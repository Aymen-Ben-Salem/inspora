import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
  test: { include: [
    "src/components/admin/creator-directory-search.test.tsx",
    "src/components/admin/creator-edit-drawer.test.tsx",
    "src/components/admin/creator-work-drawer.test.tsx",
    "src/components/admin/library-pages.test.tsx",
    "src/components/archive-filter-menu.test.tsx",
    "src/components/logos/logo-archive.test.tsx",
    "src/components/view-filter.test.tsx",
  ] },
});
