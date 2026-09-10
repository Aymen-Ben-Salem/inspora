import { describe, expect, it, vi } from "vitest";

import type { EnvironmentFingerprint } from "./environment-fingerprint";
import {
  resolvePreviewBuildEnvironment,
  runPreviewBuild,
} from "./preview-build";

const approvedPreview: EnvironmentFingerprint = {
  dataEnvironment: "preview",
  neonEndpointSha256:
    "d744a333674fbc34e941319cfb5a2d8455660faef74f75ccac422f3cb74f77e3",
  r2BucketSha256:
    "fbbc3334e2325e09e43cb32dd41ba6e63d0f3ffad0bf108a1cb0db971610f8b7",
  publicMediaHostSha256:
    "425008e1364364fa8e8f714f526d5ad8256cc3961ba4569a5805f5ff4e741117",
};

const developmentFixture = `
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_fixture
CLERK_SECRET_KEY=sk_test_fixture
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=dev-posthog-token
NEXT_PUBLIC_POSTHOG_HOST=https://analytics.example.test
DATABASE_URL=postgresql://wrong:secret@development.example.neon.tech/neondb
R2_BUCKET_NAME=wrong-development-bucket
`;

const previewFixture = `
DATA_ENVIRONMENT=preview
DATABASE_URL=postgresql://preview:secret@ep-safe-pooler.example.neon.tech/neondb
DATABASE_URL_UNPOOLED=postgresql://preview:secret@ep-safe.example.neon.tech/neondb
R2_ACCOUNT_ID=preview-account
R2_ACCESS_KEY_ID=preview-key
R2_SECRET_ACCESS_KEY=preview-secret
R2_BUCKET_NAME=fixture-bucket
R2_PUBLIC_BASE_URL=https://fixture-media.r2.dev
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_must_not_win
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=preview-posthog-must-not-win
`;

describe("guarded Preview build", () => {
  it("reads only development and Preview fixtures and layers their owned values", () => {
    const reads: string[] = [];
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      baseEnvironment: {
        NODE_ENV: "development",
        PATH: "fixture-path",
        DATABASE_URL: "postgresql://inherited:secret@production.example/neondb",
        CLERK_SECRET_KEY: "inherited-secret",
      },
      approvedFingerprint: approvedPreview,
      readFile(path) {
        reads.push(path.replaceAll("\\", "/"));
        if (path.endsWith(".env.local")) return developmentFixture;
        if (path.endsWith(".env.preview.local")) return previewFixture;
        throw new Error(`Unexpected fixture read: ${path}`);
      },
    });

    expect(reads).toEqual([
      "C:/isolated-fixture/.env.local",
      "C:/isolated-fixture/.env.preview.local",
    ]);
    expect(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_test_fixture");
    expect(environment.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN).toBe("dev-posthog-token");
    expect(environment.DATABASE_URL).toContain("ep-safe-pooler.example.neon.tech");
    expect(environment.R2_BUCKET_NAME).toBe("fixture-bucket");
  });

  it("rejects a mismatched Preview fixture before running sitemap or build", async () => {
    const runCommand = vi.fn();

    await expect(
      runPreviewBuild({
        cwd: "C:/isolated-fixture",
        approvedFingerprint: approvedPreview,
        readFile(path) {
          if (path.endsWith(".env.local")) return developmentFixture;
          return previewFixture.replace("fixture-bucket", "wrong-bucket");
        },
        runCommand,
      }),
    ).rejects.toThrow("R2 bucket");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects missing development Clerk configuration before running commands", async () => {
    const runCommand = vi.fn();

    await expect(
      runPreviewBuild({
        cwd: "C:/isolated-fixture",
        approvedFingerprint: approvedPreview,
        readFile(path) {
          if (path.endsWith(".env.local")) {
            return developmentFixture.replace("CLERK_SECRET_KEY=sk_test_fixture", "");
          }
          return previewFixture;
        },
        runCommand,
      }),
    ).rejects.toThrow("CLERK_SECRET_KEY is missing from .env.local");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects live Clerk configuration", async () => {
    const runCommand = vi.fn();
    const liveClerk = developmentFixture.replace(
      "pk_test_fixture",
      "pk_live_fixture",
    );

    await expect(
      runPreviewBuild({
        cwd: "C:/isolated-fixture",
        approvedFingerprint: approvedPreview,
        readFile(path) {
          return path.endsWith(".env.local") ? liveClerk : previewFixture;
        },
        runCommand,
      }),
    ).rejects.toThrow("development Clerk");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not inherit PostHog values missing from development config", () => {
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      baseEnvironment: {
        NODE_ENV: "development",
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "inherited-token",
      },
      approvedFingerprint: approvedPreview,
      readFile(path) {
        return path.endsWith(".env.local")
          ? developmentFixture.replace(
              "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=dev-posthog-token",
              "",
            )
          : previewFixture;
      },
    });

    expect(environment.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN).toBeUndefined();
  });

  it("runs the Preview sitemap before the application build", async () => {
    const calls: string[][] = [];

    await runPreviewBuild({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      readFile(path) {
        return path.endsWith(".env.local") ? developmentFixture : previewFixture;
      },
      async runCommand(command) {
        calls.push([command.executable, ...command.args]);
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.join(" ")).toContain("generate-sitemap.ts");
    expect(calls[1]?.join(" ")).toContain("next build");
  });

  it("preloads the production-config blocker for the Next build command", () => {
    const commands = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      readFile(path) {
        return path.endsWith(".env.local") ? developmentFixture : previewFixture;
      },
    });

    expect(commands.NODE_OPTIONS).toContain("block-production-environment.cjs");
  });
});
