import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: [
    "src/features/admin/library-performance.test.ts",
    "src/features/admin/secondary-performance.test.ts",
    "src/features/admin/creator-work-repository.test.ts",
    "src/components/admin/creator-work-drawer.test.tsx",
    "src/app/admin/creators/[id]/works/route.test.ts",
    "src/proxy.test.ts",
    "src/features/admin/queue-performance.test.ts",
    "src/features/admin/converter-lifecycle.test.ts",
    "src/features/admin/media-preparation-lifecycle.test.ts",
    "src/features/admin/image-optimization.test.ts",
    "src/features/media/prepare-and-upload.test.ts",
    "src/components/admin/media-upload-lifecycle.test.tsx",
    "src/components/admin/editor-persistence.test.tsx",
    "src/components/admin/submission-review.test.tsx",
    "src/components/admin/creator-picker.test.tsx",
    "src/features/creators/identity-admin.test.ts",
    "src/components/admin/media-preview.test.tsx",
    "src/components/admin/library-pages.test.tsx",
    "src/components/admin/billing-performance.test.tsx",
    "src/components/admin/admin-requests.test.tsx",
    "src/components/profile/viewer-profile-provider.test.tsx",
    "src/components/sponsorship/public-placements.test.tsx",
    "src/components/sponsorship/placement-sequence.test.ts",
    "src/app/admin/page.test.tsx",
    "src/auth/require-admin.test.ts",
    "src/components/auth/admin-auth-entry.test.tsx",
  ] },
});
