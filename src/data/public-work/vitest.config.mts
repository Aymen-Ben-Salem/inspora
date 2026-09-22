import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: {
    include: [
      "src/data/public-work/**/*.test.ts",
      "src/data/websites-repository.test.ts",
      "src/data/posts-repository.test.ts",
      "src/data/post-pagination.test.ts",
      "src/data/logos-repository.test.ts",
      "src/app/api/posts/route.test.ts",
    ],
  },
});
