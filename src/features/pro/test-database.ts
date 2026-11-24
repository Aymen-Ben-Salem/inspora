import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ProTx } from "./repository";

/**
 * In-process PostgreSQL (PGlite) with the real Pro migration applied. It runs
 * genuine SQL, constraints and row-lock syntax, but on a single connection:
 * concurrent transactions are serialized, so this default cannot prove Neon
 * lock contention. The explicitly enabled, guarded Neon backend below provides
 * that integration path without loading any application database URL.
 */
export async function createProTestDatabase() {
  if (process.env.PRO_TEST_BACKEND === "neon") return createNeonTestDatabase();
  if (process.env.PRO_TEST_BACKEND && process.env.PRO_TEST_BACKEND !== "pglite") throw new Error("Unknown Pro test backend.");
  const client = new PGlite();
  const migration = readFileSync(fileURLToPath(new URL("../../../drizzle/0047_pro_subscription.sql", import.meta.url)), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement);
  const db = drizzle(client, { schema });
  let queue = Promise.resolve();
  // PGlite has one connection; queue transactions as separate sessions would block on locks.
  const transaction = <T>(work: (tx: ProTx) => Promise<T>): Promise<T> => {
    const run = queue.then(() => db.transaction((tx) => work(tx as unknown as ProTx)));
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  // Starting PGlite is slow; reuse one instance per test file and reset rows between tests.
  const reset = () => client.exec("truncate pro_disputes, pro_subscriptions, pro_stripe_events, pro_accounts cascade");
  return { backend: "pglite" as const, db: db as unknown as ProTx, transaction, reset, close: () => client.close(), pool: null };
}

/** Opt-in only: no fallback to DATABASE_URL or any application environment. */
async function createNeonTestDatabase() {
  const connectionString = process.env.PRO_TEST_DATABASE_URL;
  const branchId = process.env.PRO_TEST_BRANCH_ID;
  if (!connectionString || !/^br-[a-z0-9-]+$/.test(branchId ?? "")) throw new Error("Explicit isolated Pro test database and branch are required.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") || !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) throw new Error("Pro test database connection rejected.");
  const endpointHost = url.hostname.replace(/-pooler(?=\.)/, "");
  const pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 30_000, idleTimeoutMillis: 1000 });
  const db = neonDrizzle(pool, { schema });
  const assertFixture = async (tx: ProTx) => {
    const result = await tx.execute(sql`select branch_id,endpoint_host,fixture_only from public.inspora_pro_test_fixture where fixture = 'inspora-pro-isolated-v1' for share`);
    const rows = (result as unknown as { rows: { branch_id: string; endpoint_host: string; fixture_only: boolean }[] }).rows;
    if (rows.length !== 1 || rows[0].branch_id !== branchId || rows[0].endpoint_host !== endpointHost || rows[0].fixture_only !== true)
      throw new Error("Pro test fixture guard rejected the database. No reset is permitted.");
  };
  // Match the production writer exactly: acquire one physical client for the
  // entire interactive transaction and always release it, including on errors.
  const transaction = async <T>(work: (tx: ProTx) => Promise<T>) => {
    const client = await pool.connect();
    try { return await neonDrizzle(client, { schema }).transaction((tx) => work(tx as unknown as ProTx)); }
    finally { client.release(); }
  };
  try {
    // Guard creation/migration is deliberately outside this test helper. A
    // misconfigured production URL cannot self-certify as a disposable fixture.
    await transaction(assertFixture);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const reset = () => transaction(async (tx) => {
    await assertFixture(tx);
    // These four isolated Pro tables have no dependencies on existing data.
    // No CASCADE: a future cross-domain dependency must stop the reset.
    await tx.execute(sql`truncate pro_disputes, pro_subscriptions, pro_stripe_events, pro_accounts`);
  });
  return { backend: "neon" as const, db: db as unknown as ProTx, transaction, reset, close: () => pool.end(), pool };
}
