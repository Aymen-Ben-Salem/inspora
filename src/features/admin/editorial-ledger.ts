import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";
import { type WriteTx, withWriteTransaction } from "@/db/write-client";

// Preview and production share a ledger, never independent copies of the $70 cap.
// This connection is used only for the editorial ledger, not normal work writes.
export async function withEditorialLedger<T>(work: (tx: WriteTx) => Promise<T>): Promise<T> {
  if (process.env.DATA_ENVIRONMENT === "development") return withWriteTransaction(work);
  const url = process.env.EDITORIAL_LEDGER_DATABASE_URL;
  if (!url) throw new Error("Editorial generation needs its shared spending ledger configured.");
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
      decodeURIComponent(parsed.username) !== "inspora_editorial_ledger" ||
      !parsed.hostname.replace(/-pooler(?=\.)/, "").startsWith("ep-plain-glade-aswp1anv.") ||
      !parsed.hostname.endsWith(".neon.tech")) throw new Error("Editorial ledger identity mismatch.");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try { return await drizzle(client, { schema }).transaction(work); }
  finally { client.release(); await pool.end(); }
}
