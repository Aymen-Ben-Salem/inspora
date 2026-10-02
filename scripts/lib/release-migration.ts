import { createHash } from "node:crypto";

export type ReleaseDatabaseTarget = {
  label: "production" | "rehearsal";
  endpointSha256: string;
  roleSha256: string;
  sourceDatabase: string;
  destinationDatabase: string;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Pure validation, deliberately executed before constructing a database client. */
export function releaseDatabaseFromValues(
  values: Record<string, string | undefined>,
  target: ReleaseDatabaseTarget,
  inherited: Record<string, string | undefined>,
) {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATA_ENVIRONMENT"]) {
    if (inherited[key] && inherited[key] !== values[key]) throw new Error(`Release inherited ${key} differs from the explicit environment file.`);
  }
  if (target.label === "production" && values.DATA_ENVIRONMENT !== "production") throw new Error("Release DATA_ENVIRONMENT must be production.");
  if (target.label === "rehearsal" && values.DATA_ENVIRONMENT && values.DATA_ENVIRONMENT !== "rehearsal") throw new Error("Release DATA_ENVIRONMENT must identify rehearsal.");
  const parsed = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].map(key => {
    let u: URL;
    try { u = new URL(values[key] ?? ""); } catch { throw new Error(`Release ${key} is missing or invalid.`); }
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname.endsWith('.neon.tech') || !u.username || !u.password || u.hash || u.port && u.port !== '5432') throw new Error(`Release ${key} format rejected.`);
    if (!["require", "verify-full"].includes(u.searchParams.get("sslmode") ?? "") || [...u.searchParams.keys()].some(k => !["sslmode", "channel_binding"].includes(k))) throw new Error(`Release ${key} connection options rejected.`);
    if (hash(u.hostname.replace(/-pooler(?=\.)/, "")) !== target.endpointSha256 || hash(u.username) !== target.roleSha256 || u.pathname !== "/" + target.sourceDatabase) throw new Error(`Release ${key} destination rejected.`);
    return u;
  });
  if (parsed[1].hostname.includes("-pooler.") || parsed[0].password !== parsed[1].password) throw new Error("Release direct/pooled connection mismatch.");
  parsed[1].pathname = "/" + target.destinationDatabase;
  return parsed[1].toString();
}

export type ReleaseMigration = { tag: string; when: number; hash: string; lfHash: string };
export type ReleaseLedgerRow = { id: number; hash: string; created_at: string | number };

/** Drizzle uses the last timestamp; we additionally verify every earlier entry. */
export function pendingReleaseMigrations(migrations: ReleaseMigration[], ledger: ReleaseLedgerRow[]) {
  if (!ledger.length || ledger.length > migrations.length) throw new Error("Release ledger is empty or ahead of the pinned journal.");
  for (let i=0; i<migrations.length; i++) {
    if (!Number.isSafeInteger(migrations[i].when) || i && migrations[i].when <= migrations[i-1].when) throw new Error("Release ledger journal order is invalid.");
  }
  for (let i=0; i<ledger.length; i++) {
    const actual=ledger[i],expected=migrations[i];
    // PostgreSQL sequences are not transactional: a failed migration can leave
    // ID gaps. Journal timestamps and hashes establish the complete prefix.
    if (!Number.isSafeInteger(actual.id) || actual.id < 1 || i > 0 && actual.id <= ledger[i-1].id || String(actual.created_at) !== String(expected.when) || ![expected.hash,expected.lfHash].includes(actual.hash)) throw new Error(`Release ledger differs at ${expected.tag}.`);
  }
  return migrations.slice(ledger.length);
}

export const RELEASE_DATABASE_TARGETS: Record<"production"|"rehearsal",ReleaseDatabaseTarget> = {
  production: {label:"production",endpointSha256:"b2a9a99ea8937241fc4d41d5b738d446ac4b801844e1bc7b99646b79aca955d9",roleSha256:"6f198191100386e1f0c093fc1c902c0520c6382059d75fb4743ec1ec75cc7842",sourceDatabase:"neondb",destinationDatabase:"neondb"},
  rehearsal: {label:"rehearsal",endpointSha256:"41216fa6801e563d2e658d1a0ceaaf96f2848e74984a1533d852eec485f75918",roleSha256:"6f198191100386e1f0c093fc1c902c0520c6382059d75fb4743ec1ec75cc7842",sourceDatabase:"neondb",destinationDatabase:"phase3_production_restore"},
};
