import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  type EnvironmentFingerprint,
} from "./environment-fingerprint";

const DEVELOPMENT_CONFIGURATION_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "ADMIN_USER_IDS",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_API_HOST",
] as const;

const PREVIEW_CONFIGURATION_KEYS = [
  "DATA_ENVIRONMENT",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
] as const;

type EnvironmentReader = (path: string) => string;

export type PreviewBuildCommand = {
  executable: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
};

export type PreviewBuildOptions = {
  cwd?: string;
  baseEnvironment?: NodeJS.ProcessEnv;
  approvedFingerprint?: EnvironmentFingerprint;
  readFile?: EnvironmentReader;
  runCommand?: (command: PreviewBuildCommand) => Promise<void>;
};

function required(values: Record<string, string>, name: string, source: string) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is missing from ${source}.`);
  return value;
}

function copyOwnedValues(
  target: NodeJS.ProcessEnv,
  source: Record<string, string>,
  keys: readonly string[],
) {
  for (const key of keys) {
    delete target[key];
    if (Object.hasOwn(source, key)) target[key] = source[key];
  }
}

export function resolvePreviewBuildEnvironment(
  options: Omit<PreviewBuildOptions, "runCommand"> = {},
) {
  const cwd = options.cwd ?? process.cwd();
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const development = parse(readFile(resolve(cwd, ".env.local")));
  const preview = parse(readFile(resolve(cwd, ".env.preview.local")));
  const environment = { ...(options.baseEnvironment ?? process.env) };

  const clerkPublishableKey = required(
    development,
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ".env.local",
  );
  const clerkSecretKey = required(development, "CLERK_SECRET_KEY", ".env.local");
  if (
    !clerkPublishableKey.startsWith("pk_test_") ||
    !clerkSecretKey.startsWith("sk_test_")
  ) {
    throw new Error("The guarded Preview build requires development Clerk keys.");
  }
  copyOwnedValues(environment, development, DEVELOPMENT_CONFIGURATION_KEYS);
  copyOwnedValues(environment, preview, PREVIEW_CONFIGURATION_KEYS);

  const blockerPath = resolve(cwd, "scripts", "block-production-environment.cjs");
  const existingNodeOptions = environment.NODE_OPTIONS?.trim();
  environment.NODE_OPTIONS = [
    existingNodeOptions,
    `--require=${JSON.stringify(blockerPath)}`,
  ]
    .filter(Boolean)
    .join(" ");

  assertEnvironmentFingerprint(
    {
      dataEnvironment: required(preview, "DATA_ENVIRONMENT", ".env.preview.local"),
      databaseUrl: required(preview, "DATABASE_URL", ".env.preview.local"),
      databaseUrlUnpooled: required(
        preview,
        "DATABASE_URL_UNPOOLED",
        ".env.preview.local",
      ),
      r2BucketName: required(preview, "R2_BUCKET_NAME", ".env.preview.local"),
      r2PublicBaseUrl: required(
        preview,
        "R2_PUBLIC_BASE_URL",
        ".env.preview.local",
      ),
    },
    options.approvedFingerprint ?? APPROVED_ENVIRONMENT_FINGERPRINTS.preview,
  );

  return environment;
}

export function previewBuildCommands(
  cwd: string,
  environment: NodeJS.ProcessEnv,
): PreviewBuildCommand[] {
  return [
    {
      executable: process.execPath,
      args: [
        resolve(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
        resolve(cwd, "scripts", "generate-sitemap.ts"),
      ],
      cwd,
      environment,
    },
    {
      executable: process.execPath,
      args: [resolve(cwd, "node_modules", "next", "dist", "bin", "next"), "build"],
      cwd,
      environment,
    },
  ];
}

async function executeCommand(command: PreviewBuildCommand) {
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.environment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectCommand);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      rejectCommand(
        new Error(
          `Preview build command failed (${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`}).`,
        ),
      );
    });
  });
}

export async function runPreviewBuild(options: PreviewBuildOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const environment = resolvePreviewBuildEnvironment(options);
  const runCommand = options.runCommand ?? executeCommand;

  for (const command of previewBuildCommands(cwd, environment)) {
    await runCommand(command);
  }
}
