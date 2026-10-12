import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { parse } from "dotenv";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { previewEnvironmentFromValues } from "./lib/preview-environment";
import { pendingReleaseMigrations } from "./lib/release-migration";
import { captureReleaseDatabase, releaseHash, releaseObjectHash } from "./lib/release-migration-execution";
import { readSponsorBackupReferences } from "./lib/sponsor-backup-references";
import { assertNoPreviewSponsorshipTransfer, SPONSORSHIP_BACKUP_TABLES } from "./lib/sponsor-release-policy";
import { SPONSORSHIP_CONFIGURATION_KEYS, validateSponsorRecoveryEnvironment } from "./lib/sponsorship-environment";
let readinessStage = "arguments";

async function main() {
  const [target, output, ...extra] = process.argv.slice(2);
  if (!["preview", "contract"].includes(target) || !output || extra.length)
    throw new Error("Use sponsorship-readiness.ts preview|contract NEW_REPORT_PATH.");
  const root = realpathSync(".scratch/sponsorship/verification");
  const reportPath = resolve(output);
  if (!reportPath.startsWith(root + sep) || existsSync(reportPath))
    throw new Error("Use a new report inside the sponsorship verification directory.");
  mkdirSync(dirname(reportPath), { recursive: true });
  if (!realpathSync(dirname(reportPath)).startsWith(root + sep) && realpathSync(dirname(reportPath)) !== root)
    throw new Error("Readiness report directory rejected.");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  if (git("branch", "--show-current") !== "preview/archive-updates") throw new Error("Preview branch required.");
  const tracked = git("ls-files", "--cached", "--others", "--exclude-standard").split(/\r?\n/).filter(file => /^(src\/|scripts\/|drizzle\/)/.test(file) || ["package.json", "package-lock.json", "next.config.ts", "vercel.json"].includes(file));
  const sourceHashes = Object.fromEntries(tracked.map(file => [file, releaseHash(readFileSync(file))]));
  const preview = parse(readFileSync(".env.preview.local"));
  readinessStage = "environment";
  const values = target === "preview" ? preview : parse(readFileSync(".scratch/sponsorship/.env.ticket01-rehearsal"));
  const environment = previewEnvironmentFromValues(values);
  if (target === "contract" && !/^\/sponsorship_ticket01_[a-f0-9]{32}$/.test(new URL(environment.databaseUrl).pathname))
    throw new Error("Disposable preview contract database required.");
  const recoveryFlags = { SPONSORSHIP_ENABLED: "true", SPONSORSHIP_WRITES_ENABLED: "false", SPONSORSHIP_CHECKOUT_ENABLED: "false" };
  // Contract verification explicitly selects local TEST billing configuration.
  // Hosted preview's missing values are reported as gates, never inherited.
  const recoveryValues: Record<string, string | undefined> = { ...preview, ...recoveryFlags };
  if (target === "contract") {
    const local = parse(readFileSync(".env.local"));
    for (const name of SPONSORSHIP_CONFIGURATION_KEYS)
      if (!name.startsWith("SPONSORSHIP_")) recoveryValues[name] = local[name];
  }
  let configurationValidated = true;
  const missingConfiguration = SPONSORSHIP_CONFIGURATION_KEYS.filter(name => !name.startsWith("SPONSORSHIP_") && !recoveryValues[name] && name !== "STRIPE_SPONSOR_ONE_TIME_PRICE_ID");
  try { validateSponsorRecoveryEnvironment(recoveryValues); }
  catch { configurationValidated = false; }
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const files = readMigrationFiles({ migrationsFolder: "drizzle" });
  const migrations = journal.entries.map((entry: { tag: string; when: number }, i: number) => ({ ...entry, hash: files[i].hash, lfHash: releaseHash(readFileSync(`drizzle/${entry.tag}.sql`, "utf8").replace(/\r\n/g, "\n")) }));
  const pool = new Pool({ connectionString: environment.databaseUrlUnpooled, connectionTimeoutMillis: 20000, max: 1 });
  readinessStage = "database connection";
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '30s'");
      readinessStage = "database schema inventory";
      const database = await captureReleaseDatabase(client, { allowMissingLedger: target === "contract" });
      readinessStage = "migration prefix";
      const pending = database.migrationLedgerPresent ? pendingReleaseMigrations(migrations, database.ledger).map(m => m.tag) : null;
      const missingTables = SPONSORSHIP_BACKUP_TABLES.filter(table => !database.columns[table]);
      readinessStage = "backup references";
      const references = missingTables.length ? [] : await readSponsorBackupReferences(client);
      await client.query("COMMIT");
      // This executable reports structural selection policy. Current editorial
      // media/content still needs its independently pinned release-content plan.
      const excluded = SPONSORSHIP_BACKUP_TABLES.map(table => {
        try { assertNoPreviewSponsorshipTransfer({ inserts: { [table]: [{ id: "disposable" }] }, mediaKeys: [] }); return false; }
        catch { return true; }
      });
      if (excluded.some(result => !result)) throw new Error("Sponsor transfer policy failed.");
      const report = {
        at: new Date().toISOString(), target, source: { head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), hashes: sourceHashes, sha256: releaseObjectHash(sourceHashes), trackedWorktreeClean: git("status", "--porcelain").length === 0 },
        readOnly: true, remoteMutations: 0,
        migrations: { latest: migrations.at(-1)?.tag, sourceSha256: releaseObjectHash(migrations), migrationLedgerVerified: database.migrationLedgerPresent, applied: database.migrationLedgerPresent ? database.ledger.length : null, pending },
        database: { schemaSha256: releaseObjectHash([database.schema, database.constraints, database.indexes]), tableHashes: database.data, missingSponsorshipTables: missingTables },
        transfer: { previewSponsorRowsSelected: 0, tablesDenied: [...SPONSORSHIP_BACKUP_TABLES], structuralSeats: "Migration seeds four empty slots; no seat content import", independentEditorialPlanRequired: true },
        backup: { tables: [...SPONSORSHIP_BACKUP_TABLES], references: references.length, requiredReferences: references.filter(r => r.required).length, finalCapturePerformed: false, independentRestoreRequiredAtFreeze: true },
        recovery: { flags: recoveryFlags, configurationValidated, missingConfiguration, configurationSource: target === "contract" ? "Explicit local test billing plus preview analytics" : "Preview environment only", runtimeReceiptRequired: true, upgradedDataRetained: true, automaticSnapshotRestoration: false },
        launchGates: ["T-24h fresh sync plus independent DB/media backup capture and restore", "Current hosted migrations and full signed-in Clerk MFA/editor/dashboard acceptance", "Verified legal seller, merchant, invoices and transaction-specific tax treatment", "Separately approved live-mode billing support and actual production Stripe price/portal/webhook verification", "Production PostHog cookieless/project credentials, source-specific UTC cutovers and signed hourly job setup", "Protected production candidate and compatible recovery deployment verification before public switch"],
      };
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
      console.log(JSON.stringify({ report: output, source: report.source.head, pendingMigrations: pending?.length ?? null, migrationLedgerVerified: database.migrationLedgerPresent, missingSponsorshipTables: missingTables.length, sponsorRowsSelected: 0, remoteMutations: 0 }));
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch(error => {
  const reason = error instanceof Error && /^(Backup|Release|Recovery|Preview|Sponsorship|Use |Disposable|Readiness)/.test(error.message) ? error.message : "Configuration/schema/access check failed; credentials suppressed.";
  console.error("Sponsorship readiness stopped at " + readinessStage + ": " + reason);
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", databaseCode: error?.code, constraint: error?.constraint }));
  process.exitCode = 1;
});
