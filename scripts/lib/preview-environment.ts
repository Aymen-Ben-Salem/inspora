import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  type EnvironmentFingerprint,
} from "./environment-fingerprint";

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

function required(values: Record<string, string | undefined>, name: string) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is missing from .env.preview.local.`);
  return value;
}

export function previewEnvironmentFromValues(
  values: Record<string, string | undefined>,
  options: {
    source?: string;
    approvedFingerprint?: EnvironmentFingerprint;
  } = {},
): PreviewEnvironment {
  const source = options.source ?? ".env.preview.local";
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

  try {
    assertEnvironmentFingerprint(
      environment,
      options.approvedFingerprint ?? APPROVED_ENVIRONMENT_FINGERPRINTS.preview,
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${source}: ${error.message}`, { cause: error });
    }
    throw error;
  }
  return environment;
}

export function loadPreviewEnvironment(options: {
  path?: string;
  readFile?: (path: string) => string;
  approvedFingerprint?: EnvironmentFingerprint;
} = {}): PreviewEnvironment {
  const path = options.path ?? ENV_PATH;
  if (!options.readFile && !existsSync(path)) {
    throw new Error("Create the ignored .env.preview.local file first.");
  }

  const readFile = options.readFile ?? ((target: string) => readFileSync(target, "utf8"));
  const values = parse(readFile(path));
  return previewEnvironmentFromValues(values, {
    source: path,
    approvedFingerprint: options.approvedFingerprint,
  });
}
