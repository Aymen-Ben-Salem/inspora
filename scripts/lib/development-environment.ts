import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

export type DevelopmentMediaEnvironment = {
  dataEnvironment: string;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicBaseUrl: string;
};

const ENV_PATH = resolve(process.cwd(), ".env.local");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.local.`);
  return value;
}

function assertPostgresUrl(name: string, value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  if (!url.hostname.endsWith(".neon.tech")) {
    throw new Error(`${name} must point to the development Neon database.`);
  }
}

export function assertDevelopmentMediaEnvironment(
  environment: DevelopmentMediaEnvironment,
  nodeEnvironment = process.env.NODE_ENV,
) {
  if (nodeEnvironment === "production") {
    throw new Error("Development media commands refuse to run with NODE_ENV=production.");
  }
  if (environment.dataEnvironment !== "development") {
    throw new Error("DATA_ENVIRONMENT must be development in .env.local.");
  }

  assertPostgresUrl("DATABASE_URL", environment.databaseUrl);
  assertPostgresUrl("DATABASE_URL_UNPOOLED", environment.databaseUrlUnpooled);

  if (environment.r2BucketName !== "inspora-media-dev") {
    throw new Error("R2_BUCKET_NAME must be inspora-media-dev.");
  }

  const publicUrl = new URL(environment.r2PublicBaseUrl);
  if (
    publicUrl.protocol !== "https:" ||
    !publicUrl.hostname.endsWith(".r2.dev") ||
    publicUrl.hostname === "media.inspora.design" ||
    publicUrl.search ||
    publicUrl.hash
  ) {
    throw new Error("R2_PUBLIC_BASE_URL must be an isolated development r2.dev URL.");
  }
}

export function loadDevelopmentMediaEnvironment(): DevelopmentMediaEnvironment {
  if (!existsSync(ENV_PATH)) {
    throw new Error("Create the ignored .env.local file before running development media commands.");
  }

  const result = config({ path: ENV_PATH, override: true, quiet: true });
  if (result.error) throw result.error;

  const environment = {
    dataEnvironment: required("DATA_ENVIRONMENT"),
    databaseUrl: required("DATABASE_URL"),
    databaseUrlUnpooled: required("DATABASE_URL_UNPOOLED"),
    r2AccountId: required("R2_ACCOUNT_ID"),
    r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    r2BucketName: required("R2_BUCKET_NAME"),
    r2PublicBaseUrl: required("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  } satisfies DevelopmentMediaEnvironment;

  assertDevelopmentMediaEnvironment(environment);
  return environment;
}

export type DevelopmentExecutionOptions = {
  execute: boolean;
  confirmedDevelopment: boolean;
  limit?: number;
};

export function parseDevelopmentExecutionOptions(
  args = process.argv.slice(2),
): DevelopmentExecutionOptions {
  let execute = false;
  let confirmedDevelopment = false;
  let limit: number | undefined;

  for (const argument of args) {
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--confirm-development") {
      confirmedDevelopment = true;
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

  if (execute && !confirmedDevelopment) {
    throw new Error("--execute requires --confirm-development.");
  }

  return { execute, confirmedDevelopment, limit };
}
