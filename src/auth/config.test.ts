import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getClerkAuthorizedParties,
  getConfiguredAdminUserIds,
  isClerkConfigured,
} from "./config";

describe("Clerk configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, "sk_test_dummy", false],
    ["pk_test_dummy", undefined, false],
    ["", "sk_test_dummy", false],
    ["pk_test_dummy", "", false],
    ["   ", "sk_test_dummy", false],
    ["pk_test_dummy", "   ", false],
    ["pk_test_REPLACE_ME", "sk_test_dummy", false],
    ["pk_test_dummy", "sk_test_REPLACE_ME", false],
    ["pk_test_REPLACE_ME", "sk_test_REPLACE_ME", false],
    ["pk_test_dummy", "sk_test_dummy", true],
  ])(
    "checks configuration presence for case %#",
    (publishableKey, secretKey, expected) => {
      vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", publishableKey);
      vi.stubEnv("CLERK_SECRET_KEY", secretKey);

      expect(isClerkConfigured()).toBe(expected);
    },
  );
});

describe("admin authentication configuration", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_ADDITIONAL_USER_IDS", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not treat the example placeholder as an admin", () => {
    vi.stubEnv("ADMIN_USER_IDS", "user_REPLACE_ME");

    expect(getConfiguredAdminUserIds().size).toBe(0);
  });

  it("normalizes a comma-separated Clerk user allowlist", () => {
    vi.stubEnv("ADMIN_USER_IDS", " user_alpha,not-a-clerk-id,user_beta,user_alpha ");

    expect([...getConfiguredAdminUserIds()]).toEqual(["user_alpha", "user_beta"]);
  });

  it("preserves existing admins while adding and deduplicating additional IDs", () => {
    vi.stubEnv("ADMIN_USER_IDS", "user_alpha,user_beta");
    vi.stubEnv(
      "ADMIN_ADDITIONAL_USER_IDS",
      " user_gamma,user_alpha,not-a-clerk-id,user_REPLACE_ME,, ",
    );

    expect([...getConfiguredAdminUserIds()]).toEqual([
      "user_alpha", "user_beta", "user_gamma",
    ]);
  });

  it("does not grant admin access when both lists are absent", () => {
    vi.stubEnv("ADMIN_USER_IDS", undefined);

    expect(getConfiguredAdminUserIds().size).toBe(0);
  });

  it("accepts the additional list when no primary list is configured", () => {
    vi.stubEnv("ADMIN_USER_IDS", undefined);
    vi.stubEnv("ADMIN_ADDITIONAL_USER_IDS", "user_gamma");

    expect([...getConfiguredAdminUserIds()]).toEqual(["user_gamma"]);
  });

  it("allowlists configured and Vercel deployment origins", () => {
    vi.stubEnv("SITE_URL", "https://inspora.example/path");
    vi.stubEnv("VERCEL_URL", "inspora-git-main.vercel.app");
    vi.stubEnv(
      "VERCEL_BRANCH_URL",
      "inspora-git-preview-archive-updates-inspora.vercel.app",
    );
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "inspora.vercel.app");

    expect(getClerkAuthorizedParties()).toEqual([
      "https://inspora.example",
      "https://inspora-git-main.vercel.app",
      "https://inspora-git-preview-archive-updates-inspora.vercel.app",
      "https://inspora.vercel.app",
    ]);
  });

  it("ignores malformed origins and removes duplicates", () => {
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_BRANCH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "://invalid");

    expect(getClerkAuthorizedParties()).toEqual(["http://localhost:3000"]);
  });
});
