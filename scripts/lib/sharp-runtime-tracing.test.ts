import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

import nextConfig from "../../next.config";

// Use the same matcher and glob implementation as Next's collect-build-traces.
const require = createRequire(import.meta.url);
const matches = require("next/dist/compiled/picomatch") as (
  pattern: string,
  options: { dot: boolean; contains: boolean },
) => (path: string) => boolean;
const { glob } = require("next/dist/compiled/glob") as {
  glob(
    pattern: string,
    options: { cwd: string; nodir: boolean; dot: boolean },
    callback: (error: Error | null, paths: string[]) => void,
  ): void;
};

const runtimeFiles = [
  "node_modules/sharp/package.json",
  "node_modules/sharp/dist/index.cjs",
  "node_modules/@img/sharp-linux-x64/package.json",
  "node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node",
  "node_modules/@img/sharp-libvips-linux-x64/package.json",
  "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3",
];
let fixture: string;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "sharp-runtime-tracing-"));
  for (const file of [...runtimeFiles, "node_modules/unrelated/large-asset.bin"]) {
    const path = join(fixture, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "fixture");
  }
});

afterAll(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

it.each([
  "/api/sponsorship/metadata",
  "/api/sponsorship/media/upload",
  "/api/admin/media/upload",
])("packages the Linux addon and separate libvips library for %s", async (route) => {
  const files = new Set<string>();
  for (const [routePattern, includes] of Object.entries(
    nextConfig.outputFileTracingIncludes ?? {},
  )) {
    if (!matches(routePattern, { dot: true, contains: true })(route)) continue;
    for (const pattern of includes) {
      const paths = await new Promise<string[]>((resolve, reject) => {
        glob(pattern, { cwd: fixture, nodir: true, dot: true }, (error, paths) =>
          error ? reject(error) : resolve(paths),
        );
      });
      paths.forEach((path) =>
        files.add(path.replaceAll("\\", "/").replace(/^\.\//, "")),
      );
    }
  }

  expect([...files].sort()).toEqual([...runtimeFiles].sort());
});
