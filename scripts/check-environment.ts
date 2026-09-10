import { pathToFileURL } from "node:url";

import { loadDevelopmentMediaEnvironment } from "./lib/development-environment";
import { loadPreviewEnvironment } from "./lib/preview-environment";

export function checkEnvironment(target: string | undefined) {
  if (target === "development") {
    loadDevelopmentMediaEnvironment();
    return "Development environment fingerprint verified.";
  }
  if (target === "preview") {
    loadPreviewEnvironment();
    return "Preview environment fingerprint verified.";
  }
  throw new Error("Choose exactly one fingerprint target: development or preview.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${checkEnvironment(process.argv[2])}\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Environment fingerprint failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
