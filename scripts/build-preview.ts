import { pathToFileURL } from "node:url";

import { runPreviewBuild } from "./lib/preview-build";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreviewBuild().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Preview build failed.";
    process.stderr.write(`Guarded Preview build failed: ${message}\n`);
    process.exitCode = 1;
  });
}
