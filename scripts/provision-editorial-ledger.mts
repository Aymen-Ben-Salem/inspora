import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { parse } from "dotenv";
import { loadProductionMediaEnvironment } from "./lib/production-environment";

async function main() {
  if (process.argv.length !== 3 || !["plan", "apply"].includes(process.argv[2])) throw Error("Use plan or apply.");
  const apply = process.argv[2] === "apply";
  const environment = loadProductionMediaEnvironment();
  const owner = neon(environment.databaseUrlUnpooled);
  const role = "inspora_editorial_ledger";
  const existing = await owner`SELECT rolname FROM pg_roles WHERE rolname=${role}`;
  if (existing.length) throw Error("Ledger role already exists. Inspect its grants instead of reprovisioning.");
  const objects = await owner`SELECT to_regclass('public.editorial_budgets') AS budgets,to_regclass('public.editorial_generations') AS generations`;
  if (!objects[0].budgets || !objects[0].generations) throw Error("Apply the editorial migration first.");
  if (!apply) { console.log(JSON.stringify({ roleAbsent: true, objectsReady: true, target: "production", tables: ["editorial_budgets", "editorial_generations"] })); return; }
  const file = ".env.editorial-ledger.local";
  let url: URL;
  if (fs.existsSync(file)) url = new URL(parse(fs.readFileSync(file)).EDITORIAL_LEDGER_DATABASE_URL);
  else {
    url = new URL(environment.databaseUrl); url.username = role; url.password = randomBytes(32).toString("hex");
    fs.writeFileSync(file, `EDITORIAL_LEDGER_DATABASE_URL=${url.href}\n`, { flag: "wx", mode: 0o600 });
  }
  if (url.username !== role || url.hostname !== new URL(environment.databaseUrl).hostname || !/^[a-f0-9]{64}$/.test(url.password)) throw Error("Ledger connection mismatch.");
  await owner.transaction([
    owner.query(`CREATE ROLE inspora_editorial_ledger LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${url.password}'`),
    owner.query("GRANT USAGE ON SCHEMA public TO inspora_editorial_ledger"),
    owner.query("GRANT SELECT,INSERT,UPDATE ON public.editorial_budgets,public.editorial_generations TO inspora_editorial_ledger"),
  ]);
  const ledger = neon(url.href);
  const grants = await ledger`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE')) ORDER BY c.relname`;
  if (JSON.stringify(grants.map(r => r.relname)) !== JSON.stringify(["editorial_budgets", "editorial_generations"])) throw Error("Ledger privilege check failed.");
  console.log(JSON.stringify({ configured: true, role, accessibleTables: grants.map(r => r.relname), privateLocalFile: file }));
}
main().catch(() => { console.error("Ledger provisioning stopped. Inspect the role and configuration before retrying; sensitive details suppressed."); process.exitCode = 1; });
