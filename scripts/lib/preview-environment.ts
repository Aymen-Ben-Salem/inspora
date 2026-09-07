import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

export type PreviewEnvironment = {
  dataEnvironment: string;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicBaseUrl: string;
};

const ENV_PATH = resolve(process.cwd(), ".env.preview.local");
const PRODUCTION_NEON_PREFIX = "ep-plain-glade-aswp1anv";

function required(values: Record<string, string>, name: string) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.preview.local.`);
  return value;
}

function neonEndpoint(name: string, value: string) {
  const url = new URL(value);
  if (
    (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
    !url.hostname.endsWith(".neon.tech")
  ) {
    throw new Error(`${name} must point to a Neon PostgreSQL database.`);
  }
  if (url.hostname.startsWith(PRODUCTION_NEON_PREFIX)) {
    throw new Error(`${name} must not point to the production Neon database.`);
  }
  return url.hostname.replace("-pooler.", ".");
}

export function assertPreviewEnvironment(
  environment: PreviewEnvironment,
  nodeEnvironment = process.env.NODE_ENV,
) {
  if (nodeEnvironment === "production") {
    throw new Error("Preview commands refuse to run with NODE_ENV=production.");
  }
  if (environment.dataEnvironment !== "preview") {
    throw new Error("DATA_ENVIRONMENT must be preview in .env.preview.local.");
  }

  const pooledEndpoint = neonEndpoint("DATABASE_URL", environment.databaseUrl);
  const directEndpoint = neonEndpoint(
    "DATABASE_URL_UNPOOLED",
    environment.databaseUrlUnpooled,
  );
  if (pooledEndpoint !== directEndpoint) {
    throw new Error("Preview database URLs must belong to the same Neon branch.");
  }

  if (environment.r2BucketName !== "inspora-media-preview") {
    throw new Error("R2_BUCKET_NAME must be inspora-media-preview.");
  }

  const publicUrl = new URL(environment.r2PublicBaseUrl);
  if (
    publicUrl.protocol !== "https:" ||
    !publicUrl.hostname.endsWith(".r2.dev") ||
    (publicUrl.pathname !== "/" && publicUrl.pathname !== "") ||
    publicUrl.search ||
    publicUrl.hash
  ) {
    throw new Error("R2_PUBLIC_BASE_URL must be the preview bucket's r2.dev URL.");
  }
}

export function loadPreviewEnvironment(): PreviewEnvironment {
  if (!existsSync(ENV_PATH)) {
    throw new Error("Create the ignored .env.preview.local file first.");
  }

  const values = parse(readFileSync(ENV_PATH));
  const environment = {
    dataEnvironment: required(values, "DATA_ENVIRONMENT"),
    databaseUrl: required(values, "DATABASE_URL"),
    databaseUrlUnpooled: required(values, "DATABASE_URL_UNPOOLED"),
    r2AccountId: required(values, "R2_ACCOUNT_ID"),
    r2AccessKeyId: required(values, "R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: required(values, "R2_SECRET_ACCESS_KEY"),
    r2BucketName: required(values, "R2_BUCKET_NAME"),
    r2PublicBaseUrl: required(values, "R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  } satisfies PreviewEnvironment;

  assertPreviewEnvironment(environment);
  return environment;
}
