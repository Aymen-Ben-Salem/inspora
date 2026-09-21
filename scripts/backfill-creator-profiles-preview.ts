import { execFileSync } from "node:child_process";
import { Pool } from "@neondatabase/serverless";
import { initializeCreatorProfiles } from "./lib/creator-profile-backfill-database";
import { loadPreviewEnvironment } from "./lib/preview-environment";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1) {
    throw new Error("Usage: tsx scripts/backfill-creator-profiles-preview.ts [--apply]");
  }
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  if (branch !== "preview/archive-updates") throw new Error("Run only on preview/archive-updates.");
  // Reads only .env.preview.local and rejects any other environment fingerprint.
  const preview = loadPreviewEnvironment();
  const apply = args.includes("--apply");
  const pool = new Pool({ connectionString: preview.databaseUrl });
  try {
    const client = await pool.connect();
    try {
      await client.query(apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '20s'");
      const report = await initializeCreatorProfiles(client, apply);
      await client.query("COMMIT");
      console.log(JSON.stringify({ environment: "preview", mode: apply ? "applied" : "dry-run", ...report }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Driver errors can carry connection details; expose only our operational errors.
  const message = error instanceof Error && /^(Usage:|Run only|Profile alias conflict|Creator backfill)/.test(error.message)
    ? error.message : "Preview creator-profile backfill failed; no transaction changes committed.";
  console.error(message);
  process.exitCode = 1;
});
