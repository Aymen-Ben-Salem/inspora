import { pathToFileURL } from "node:url";

export function plainBuildRejection(): never {
  throw new Error(
    "Plain application builds are not rollout-validation builds. Use npm run build:preview.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    plainBuildRejection();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plain build rejected.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
