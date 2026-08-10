import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

export type ProductionMediaEnvironment = {
  databaseUrl: string;
  databaseUrlUnpooled: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicBaseUrl: string;
};

const ENV_PATH = resolve(process.cwd(), ".env.production.local");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.production.local.`);
  return value;
}

function assertPostgresUrl(name: string, value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  if (!url.hostname.endsWith(".neon.tech")) {
    throw new Error(`${name} must point to Neon.`);
  }
}

export function loadProductionMediaEnvironment(): ProductionMediaEnvironment {
  if (!existsSync(ENV_PATH)) {
    throw new Error(
      "Create the ignored .env.production.local file before running production media commands.",
    );
  }

  const result = config({ path: ENV_PATH, override: true, quiet: true });
  if (result.error) throw result.error;

  const environment = {
    databaseUrl: required("DATABASE_URL"),
    databaseUrlUnpooled: required("DATABASE_URL_UNPOOLED"),
    cloudinaryCloudName: required("CLOUDINARY_CLOUD_NAME"),
    cloudinaryApiKey: required("CLOUDINARY_API_KEY"),
    cloudinaryApiSecret: required("CLOUDINARY_API_SECRET"),
    r2AccountId: required("R2_ACCOUNT_ID"),
    r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    r2BucketName: required("R2_BUCKET_NAME"),
    r2PublicBaseUrl: required("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  } satisfies ProductionMediaEnvironment;

  assertPostgresUrl("DATABASE_URL", environment.databaseUrl);
  assertPostgresUrl("DATABASE_URL_UNPOOLED", environment.databaseUrlUnpooled);

  if (!environment.databaseUrl.includes("-pooler.")) {
    throw new Error("DATABASE_URL must be the pooled production Neon URL.");
  }
  if (environment.databaseUrlUnpooled.includes("-pooler.")) {
    throw new Error("DATABASE_URL_UNPOOLED must be the unpooled production Neon URL.");
  }
  if (environment.r2BucketName !== "inspora-media-production") {
    throw new Error("R2_BUCKET_NAME must be inspora-media-production.");
  }
  if (environment.r2PublicBaseUrl !== "https://media.inspora.design") {
    throw new Error("R2_PUBLIC_BASE_URL must be https://media.inspora.design.");
  }

  return environment;
}

export type ExecutionOptions = {
  execute: boolean;
  limit?: number;
};

export function parseExecutionOptions(args = process.argv.slice(2)): ExecutionOptions {
  let execute = false;
  let limit: number | undefined;

  for (const argument of args) {
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument.startsWith("--limit=")) {
      const parsed = Number(argument.slice("--limit=".length));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer.");
      }
      limit = parsed;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { execute, limit };
}
