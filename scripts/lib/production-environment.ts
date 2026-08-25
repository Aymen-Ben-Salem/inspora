import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

export type ProductionMediaEnvironment = {
  dataEnvironment: string;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2BucketName: string;
  r2PublicBaseUrl: string;
};

const ENV_PATH = resolve(process.cwd(), ".env.production.local");
const PRODUCTION_NEON_PREFIX = "ep-plain-glade-aswp1anv";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.production.local.`);
  return value;
}

function assertProductionPostgresUrl(name: string, value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  if (
    !url.hostname.startsWith(PRODUCTION_NEON_PREFIX) ||
    !url.hostname.endsWith(".neon.tech")
  ) {
    throw new Error(`${name} must point to the known production Neon database.`);
  }
}

export function assertProductionMediaEnvironment(
  environment: ProductionMediaEnvironment,
) {
  if (environment.dataEnvironment !== "production") {
    throw new Error("DATA_ENVIRONMENT must be production in .env.production.local.");
  }

  assertProductionPostgresUrl("DATABASE_URL", environment.databaseUrl);
  assertProductionPostgresUrl(
    "DATABASE_URL_UNPOOLED",
    environment.databaseUrlUnpooled,
  );

  if (environment.r2BucketName !== "inspora-media-production") {
    throw new Error("R2_BUCKET_NAME must be inspora-media-production.");
  }

  const publicUrl = new URL(environment.r2PublicBaseUrl);
  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.hostname !== "media.inspora.design" ||
    (publicUrl.pathname !== "/" && publicUrl.pathname !== "") ||
    publicUrl.search ||
    publicUrl.hash
  ) {
    throw new Error("R2_PUBLIC_BASE_URL must be https://media.inspora.design.");
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
    dataEnvironment: required("DATA_ENVIRONMENT"),
    databaseUrl: required("DATABASE_URL"),
    databaseUrlUnpooled: required("DATABASE_URL_UNPOOLED"),
    r2AccountId: required("R2_ACCOUNT_ID"),
    r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    r2BucketName: required("R2_BUCKET_NAME"),
    r2PublicBaseUrl: required("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  } satisfies ProductionMediaEnvironment;

  assertProductionMediaEnvironment(environment);
  return environment;
}

export type ProductionExecutionOptions = {
  execute: boolean;
  confirmedProduction: boolean;
  limit?: number;
};

export function parseProductionExecutionOptions(
  args = process.argv.slice(2),
): ProductionExecutionOptions {
  let execute = false;
  let confirmedProduction = false;
  let limit: number | undefined;

  for (const argument of args) {
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--confirm-production") {
      confirmedProduction = true;
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

  if (execute && !confirmedProduction) {
    throw new Error("--execute requires --confirm-production.");
  }

  return { execute, confirmedProduction, limit };
}

// Backward-compatible name used by the existing production orphan cleanup command.
export const parseExecutionOptions = parseProductionExecutionOptions;
