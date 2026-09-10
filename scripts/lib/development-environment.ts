import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  type EnvironmentFingerprint,
} from "./environment-fingerprint";

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

function required(values: Record<string, string>, name: string, source: string) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is missing from ${source}.`);
  return value;
}

export function loadDevelopmentMediaEnvironment(options: {
  path?: string;
  readFile?: (path: string) => string;
  approvedFingerprint?: EnvironmentFingerprint;
} = {}): DevelopmentMediaEnvironment {
  const path = options.path ?? ENV_PATH;
  if (!options.readFile && !existsSync(path)) {
    throw new Error("Create the ignored .env.local file before running development media commands.");
  }

  const readFile = options.readFile ?? ((target: string) => readFileSync(target, "utf8"));
  const values = parse(readFile(path));

  const environment = {
    dataEnvironment: required(values, "DATA_ENVIRONMENT", path),
    databaseUrl: required(values, "DATABASE_URL", path),
    databaseUrlUnpooled: required(values, "DATABASE_URL_UNPOOLED", path),
    r2AccountId: required(values, "R2_ACCOUNT_ID", path),
    r2AccessKeyId: required(values, "R2_ACCESS_KEY_ID", path),
    r2SecretAccessKey: required(values, "R2_SECRET_ACCESS_KEY", path),
    r2BucketName: required(values, "R2_BUCKET_NAME", path),
    r2PublicBaseUrl: required(values, "R2_PUBLIC_BASE_URL", path).replace(/\/+$/, ""),
  } satisfies DevelopmentMediaEnvironment;

  assertEnvironmentFingerprint(
    environment,
    options.approvedFingerprint ?? APPROVED_ENVIRONMENT_FINGERPRINTS.development,
  );
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
