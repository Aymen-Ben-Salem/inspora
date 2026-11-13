import "server-only";

import { neon } from "@neondatabase/serverless";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "@/storage/r2-client";
import { assertProductionMediaEnvironment } from "../../../scripts/lib/production-environment";
import { ENRICHMENT_KEY } from "../../../tools/inspora-mcp/hosted-feed.mjs";

export function assertCatalogSourceEnvironment(values: Record<string, string | undefined>) {
  if (values.VERCEL_ENV !== "production" || values.VERCEL_GIT_COMMIT_REF !== "main") {
    throw new Error("Catalog delivery requires the production main deployment.");
  }
  assertProductionMediaEnvironment({ dataEnvironment: values.DATA_ENVIRONMENT ?? "", databaseUrl: values.DATABASE_URL ?? "", databaseUrlUnpooled: values.DATABASE_URL_UNPOOLED ?? values.DATABASE_URL ?? "", r2AccountId: values.R2_ACCOUNT_ID ?? "", r2AccessKeyId: values.R2_ACCESS_KEY_ID ?? "", r2SecretAccessKey: values.R2_SECRET_ACCESS_KEY ?? "", r2BucketName: values.R2_BUCKET_NAME ?? "", r2PublicBaseUrl: values.R2_PUBLIC_BASE_URL ?? "" });
  if (values.R2_SUBMISSIONS_BUCKET_NAME !== "inspora-submissions-production") throw new Error("Catalog requires production private storage.");
  const url = new URL(values.INSPORA_CATALOG_SOURCE_DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      decodeURIComponent(url.username) !== "inspora_catalog_reader" ||
      !url.hostname.replace(/-pooler(?=\.)/, "").startsWith("ep-plain-glade-aswp1anv.") ||
      !url.hostname.endsWith(".neon.tech")) throw new Error("Catalog source identity mismatch.");
}

export async function capturePublicCatalog() {
  assertCatalogSourceEnvironment(process.env);
  // A separate view-only source connection, independent of the application's login.
  const sql = neon(process.env.INSPORA_CATALOG_SOURCE_DATABASE_URL!, { fetchOptions: { signal: AbortSignal.timeout(10000) } });
  const [stamp, rows] = await sql.transaction([
    sql`SELECT now() AS captured_at, current_user AS catalog_role, current_setting('transaction_read_only') AS read_only,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND
        (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
         has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))) AS can_write_public,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_public`,
    sql`SELECT * FROM public.inspora_mcp_public_catalog ORDER BY kind,id`,
  ], { isolationLevel: "RepeatableRead", readOnly: true });
  if (stamp[0]?.read_only !== "on" || stamp[0]?.catalog_role !== "inspora_catalog_reader" ||
      stamp[0]?.can_write_public !== false || stamp[0]?.can_create_public !== false) {
    throw new Error("Catalog source must use its dedicated read-only role.");
  }
  // Match the JSON wire representation before schema/fingerprint validation.
  // Neon returns published_at as Date; updated_at::text retains source precision.
  const publicRows = JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];
  return { capturedAt: new Date(stamp[0].captured_at).toISOString(), rows: publicRows };
}

export async function readCatalogEnrichment() {
  assertCatalogSourceEnvironment(process.env);
  const storage = createR2Client({ accountId: process.env.R2_ACCOUNT_ID!, accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! });
  try {
    const object = await storage.send(new GetObjectCommand({ Bucket: process.env.R2_SUBMISSIONS_BUCKET_NAME!, Key: ENRICHMENT_KEY }), { abortSignal: AbortSignal.timeout(10000) });
    if (!object.Body || (object.ContentLength ?? Infinity) > 4 * 1024 * 1024) throw new Error("Invalid catalog notes object.");
    return JSON.parse(await object.Body.transformToString());
  } finally { storage.destroy(); }
}
