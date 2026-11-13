import fs from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { loadDevelopmentMediaEnvironment } from "./lib/development-environment";
import { loadPreviewEnvironment } from "./lib/preview-environment";
import { loadProductionMediaEnvironment } from "./lib/production-environment";
import { pendingReleaseMigrations } from "./lib/release-migration";
import { createHash } from "node:crypto";

// Scoped additive migration. Unlike the historical full release migration, it
// never locks or hashes every work/payment table while upload traffic is active.
async function main() {
  const [target, mode] = process.argv.slice(2);
  if (!["development", "preview", "production"].includes(target) || !["plan", "apply"].includes(mode) || process.argv.length !== 4) throw Error("Editorial migration requires an explicit target and plan|apply.");
  const env = target === "development" ? loadDevelopmentMediaEnvironment() : target === "preview" ? loadPreviewEnvironment() : loadProductionMediaEnvironment();
  const url = env.databaseUrlUnpooled;
  if (new URL(url).hostname.includes("-pooler")) throw Error("Direct migration connection required.");
  const files = readMigrationFiles({ migrationsFolder: "drizzle" });
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  const migrations = journal.entries.map((e: { tag: string; when: number }, i: number) => ({ ...e, hash: files[i].hash,
    lfHash: createHash("sha256").update(fs.readFileSync(`drizzle/${e.tag}.sql`, "utf8").replace(/\r\n/g, "\n")).digest("hex") }));
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SELECT pg_advisory_xact_lock(712934621)");
    await client.query("LOCK TABLE drizzle.__drizzle_migrations IN SHARE ROW EXCLUSIVE MODE");
    const ledger = (await client.query("SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
    const pending = pendingReleaseMigrations(migrations, ledger);
    if (pending.length !== 1 || pending[0].tag !== "0045_admin_editorial") throw Error("Expected only migration 0045. Inspect the current ledger before proceeding.");
    const file = files.at(-1)!;
    for (const statement of file.sql) await client.query(statement);
    await client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)", [file.hash, file.folderMillis]);
    const views = (await client.query("SELECT to_regclass('public.inspora_mcp_reviewed_notes') IS NOT NULL AS available")).rows[0];
    if (target === "production" && !views.available) throw Error("Production public catalog view is required.");
    await client.query(mode === "apply" ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ target, mode, migration: pending[0].tag, hash: file.hash, reviewedNotesView: views.available, existingWorkTablesChanged: false }));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error instanceof Error && /^(Release ledger|Expected only migration|Production public catalog)/.test(error.message) ? error.message : "Editorial migration stopped; no raw connection/provider details displayed. Inspect the target ledger before retrying."); process.exitCode = 1; });
