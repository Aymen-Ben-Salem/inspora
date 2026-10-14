import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { include: ["src/features/media/*.test.ts", "src/app/api/admin/media/route.test.ts", "src/proxy.test.ts"] },
});
