import { afterEach, describe, expect, it, vi } from "vitest";

import { getClerkAuthorizedParties, getConfiguredAdminUserIds } from "./config";

describe("admin authentication configuration", () => {
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
