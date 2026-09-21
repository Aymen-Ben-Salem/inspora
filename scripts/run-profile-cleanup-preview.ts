import { resolve } from "node:path";

import { config } from "dotenv";

import { loadPreviewEnvironment } from "./lib/preview-environment";

const POLL_MILLISECONDS = 60_000;

async function main() {
  const once = process.argv.slice(2).includes("--once");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--once");
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);

  const path = resolve(process.cwd(), ".env.preview.local");
  config({ path, override: true });
  const preview = loadPreviewEnvironment({ path });
  if (preview.dataEnvironment !== "preview" || process.env.DATA_ENVIRONMENT !== "preview") {
    throw new Error("The cleanup runner only accepts the fingerprint-verified Preview environment.");
  }
  if (!process.env.PROFILE_CLEANUP_SECRET) {
    throw new Error("PROFILE_CLEANUP_SECRET is missing from .env.preview.local.");
  }

  const { runProfileCleanup } = await import("../src/features/submissions/cleanup");
  do {
    const report = await runProfileCleanup(new Date(), 25);
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...report })}\n`);
    if (once) return;
    await new Promise<void>((resolvePoll) => setTimeout(resolvePoll, POLL_MILLISECONDS));
  } while (true);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Preview cleanup failed."}\n`);
  process.exitCode = 1;
});
