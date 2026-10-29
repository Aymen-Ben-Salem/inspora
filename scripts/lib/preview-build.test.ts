import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentFingerprint } from "./environment-fingerprint";
import {
  resolvePreviewBuildEnvironment,
  runPreviewBuild,
} from "./preview-build";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 12345, api_token: "preview-token" })),
    ),
  ),
);
afterEach(() => vi.unstubAllGlobals());

const approvedPreview: EnvironmentFingerprint = {
  dataEnvironment: "preview",
  neonEndpointSha256:
    "d744a333674fbc34e941319cfb5a2d8455660faef74f75ccac422f3cb74f77e3",
  r2BucketSha256:
    "fbbc3334e2325e09e43cb32dd41ba6e63d0f3ffad0bf108a1cb0db971610f8b7",
  publicMediaHostSha256:
    "425008e1364364fa8e8f714f526d5ad8256cc3961ba4569a5805f5ff4e741117",
  privateSubmissionsBucketSha256:
    "d6d6b1a7c74bbc10ea974685835426d103aa604c0fe2bf8e4f8b71b49205ee04",
};

const developmentFixture = `
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_fixture
CLERK_SECRET_KEY=sk_test_fixture
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=dev-posthog-token
NEXT_PUBLIC_POSTHOG_HOST=https://analytics.example.test
POSTHOG_WORK_VIEWS_CUTOVER_AT=2026-09-21T12:00:00.000Z
DATABASE_URL=postgresql://wrong:secret@development.example.neon.tech/neondb
R2_BUCKET_NAME=wrong-development-bucket
`;

const previewFixture = `
DATA_ENVIRONMENT=preview
X_API_BEARER_TOKEN=preview-x-token
DATABASE_URL=postgresql://preview:secret@ep-safe-pooler.example.neon.tech/neondb
DATABASE_URL_UNPOOLED=postgresql://preview:secret@ep-safe.example.neon.tech/neondb
R2_ACCOUNT_ID=preview-account
R2_ACCESS_KEY_ID=preview-key
R2_SECRET_ACCESS_KEY=preview-secret
R2_BUCKET_NAME=fixture-bucket
R2_PUBLIC_BASE_URL=https://fixture-media.r2.dev
R2_SUBMISSIONS_BUCKET_NAME=fixture-private-bucket
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=preview-token
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
POSTHOG_API_HOST=https://eu.posthog.com
POSTHOG_PROJECT_ID=12345
POSTHOG_PERSONAL_API_KEY=preview-read-key
POSTHOG_WORK_VIEWS_CUTOVER_AT=2026-09-21T12:00:00.000Z
`;

describe("guarded Preview build", () => {
  it("builds with an independent Preview Clerk instance without reading Development", () => {
    const reads: string[] = [];
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      baseEnvironment: {
        NODE_ENV: "development",
        CLERK_SECRET_KEY: "sk_test_inherited_dev",
        ADMIN_USER_IDS: "user_dev_admin",
        NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: "/dev-sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: "/dev-sign-up",
      },
      readFile(path) {
        reads.push(path.replaceAll("\\", "/"));
        if (!path.endsWith(".env.preview.local"))
          throw new Error("Development credentials are unavailable.");
        return previewFixture + `
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_preview
CLERK_SECRET_KEY=sk_test_preview
CLERK_WEBHOOK_SIGNING_SECRET=whsec_preview
ADMIN_USER_IDS=user_preview_admin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/preview-sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/preview-sign-up
`;
      },
    });
    expect(reads).toEqual(["C:/isolated-fixture/.env.preview.local"]);
    expect(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_test_preview");
    expect(environment.CLERK_SECRET_KEY).toBe("sk_test_preview");
    expect(environment.X_API_BEARER_TOKEN).toBe("preview-x-token");
    expect(environment.CLERK_WEBHOOK_SIGNING_SECRET).toBe("whsec_preview");
    expect(environment.ADMIN_USER_IDS).toBe("user_preview_admin");
    expect(environment.NEXT_PUBLIC_CLERK_SIGN_UP_URL).toBe("/sign-up");
    expect(environment.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL).toBe(
      "/preview-sign-in",
    );
    expect(environment.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL).toBe(
      "/preview-sign-up",
    );
  });
  it.each([
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_preview", "CLERK_SECRET_KEY"],
    ["CLERK_SECRET_KEY=sk_test_preview", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_preview\nCLERK_SECRET_KEY=sk_live_preview",
      "test Clerk",
    ],
  ])(
    "rejects partial or live Preview Clerk settings without falling back to Development: %s",
    (configuration, error) => {
      expect(() =>
        resolvePreviewBuildEnvironment({
          cwd: "C:/isolated-fixture",
          approvedFingerprint: approvedPreview,
          readFile: (path) =>
            path.endsWith(".env.preview.local")
              ? previewFixture + "\n" + configuration
              : developmentFixture,
        }),
      ).toThrow(error);
    },
  );
  it("keeps Preview admin and webhook settings empty when absent from its independent instance", () => {
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      baseEnvironment: {
        NODE_ENV: "development",
        ADMIN_USER_IDS: "user_dev_admin",
        CLERK_WEBHOOK_SIGNING_SECRET: "whsec_dev",
        NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: "/dev-sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: "/dev-sign-up",
      },
      readFile: () => previewFixture + `
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_preview
CLERK_SECRET_KEY=sk_test_preview
`,
    });
    expect(environment.ADMIN_USER_IDS).toBe("");
    expect(environment.CLERK_WEBHOOK_SIGNING_SECRET).toBe("");
    expect(environment.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL).toBe("");
    expect(environment.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL).toBe("");
  });
  it("does not inherit Stripe or sponsorship credentials/flags from another environment", () => {
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      baseEnvironment: {
        NODE_ENV: "development",
        STRIPE_SECRET_KEY: "sk_live_must_not_win",
        STRIPE_PREPARATION_SECRET_KEY: "rk_live_must_not_win",
        SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true",
        SPONSORSHIP_ENABLED: "true",
        SPONSORSHIP_CHECKOUT_ENABLED: "true",
      },
      readFile: (path) =>
        path.endsWith(".env.preview.local")
          ? previewFixture
          : developmentFixture,
    });
    expect(environment.STRIPE_SECRET_KEY).toBe("");
    expect(environment.STRIPE_PREPARATION_SECRET_KEY).toBe("");
    expect(environment.SPONSORSHIP_LIVE_PAYMENTS_ENABLED).toBe("");
    expect(environment.SPONSORSHIP_ENABLED).toBe("");
    expect(environment.SPONSORSHIP_CHECKOUT_ENABLED).toBe("");
  });
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
      "C:/isolated-fixture/.env.preview.local",
      "C:/isolated-fixture/.env.local",
    ]);
    expect(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
      "pk_test_fixture",
    );
    expect(environment.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN).toBe("preview-token");
    expect(environment.POSTHOG_WORK_VIEWS_CUTOVER_AT).toBe(
      "2026-09-21T12:00:00.000Z",
    );
    expect(environment.DATABASE_URL).toContain(
      "ep-safe-pooler.example.neon.tech",
    );
    expect(environment.R2_BUCKET_NAME).toBe("fixture-bucket");
    expect(environment.R2_SUBMISSIONS_BUCKET_NAME).toBe(
      "fixture-private-bucket",
    );
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
            return developmentFixture.replace(
              "CLERK_SECRET_KEY=sk_test_fixture",
              "",
            );
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
    ).rejects.toThrow("test Clerk");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not inherit analytics when explicitly disabled in Preview", () => {
    const environment = resolvePreviewBuildEnvironment({
      cwd: "C:/isolated-fixture",
      baseEnvironment: {
        NODE_ENV: "development",
        NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "inherited-token",
        POSTHOG_PERSONAL_API_KEY: "inherited-key",
      },
      approvedFingerprint: approvedPreview,
      readFile(path) {
        return path.endsWith(".env.local")
          ? developmentFixture
          : previewFixture.replace(/^(?:NEXT_PUBLIC_POSTHOG|POSTHOG).*$/gm, "");
      },
    });
    expect(environment.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN).toBe("");
    expect(environment.POSTHOG_PERSONAL_API_KEY).toBe("");
    expect(environment.POSTHOG_WORK_VIEWS_CUTOVER_AT).toBe("");
  });
  it.each([
    [
      "POSTHOG_PERSONAL_API_KEY=preview-read-key",
      "",
      "POSTHOG_PERSONAL_API_KEY",
    ],
    [
      "https://eu.posthog.com",
      "https://us.posthog.com",
      "same supported region",
    ],
  ])(
    "rejects incomplete/mismatched Preview analytics: %s",
    (from, to, message) => {
      expect(() =>
        resolvePreviewBuildEnvironment({
          cwd: "C:/isolated-fixture",
          approvedFingerprint: approvedPreview,
          readFile(path) {
            return path.endsWith(".env.local")
              ? developmentFixture
              : previewFixture.replace(from, to);
          },
        }),
      ).toThrow(message);
    },
  );

  it("runs the Preview sitemap before the application build", async () => {
    const calls: string[][] = [];

    await runPreviewBuild({
      cwd: "C:/isolated-fixture",
      approvedFingerprint: approvedPreview,
      readFile(path) {
        return path.endsWith(".env.local")
          ? developmentFixture
          : previewFixture;
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
        return path.endsWith(".env.local")
          ? developmentFixture
          : previewFixture;
      },
    });

    expect(commands.NODE_OPTIONS).toContain("block-production-environment.cjs");
  });
});
