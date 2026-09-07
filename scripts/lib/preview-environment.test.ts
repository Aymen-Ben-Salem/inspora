import { describe, expect, it } from "vitest";

import {
  assertPreviewEnvironment,
  type PreviewEnvironment,
} from "./preview-environment";

const safeEnvironment: PreviewEnvironment = {
  dataEnvironment: "preview",
  databaseUrl:
    "postgresql://user:password@ep-preview-branch-pooler.example.neon.tech/neondb",
  databaseUrlUnpooled:
    "postgresql://user:password@ep-preview-branch.example.neon.tech/neondb",
  r2AccountId: "preview-account",
  r2AccessKeyId: "preview-key",
  r2SecretAccessKey: "preview-secret",
  r2BucketName: "inspora-media-preview",
  r2PublicBaseUrl: "https://preview-bucket.r2.dev",
};

describe("preview environment", () => {
  it("accepts an isolated preview database and bucket", () => {
    expect(() => assertPreviewEnvironment(safeEnvironment, "development"))
      .not.toThrow();
  });

  it("rejects production execution and a missing preview marker", () => {
    expect(() => assertPreviewEnvironment(safeEnvironment, "production"))
      .toThrow("NODE_ENV");
    expect(() =>
      assertPreviewEnvironment(
        { ...safeEnvironment, dataEnvironment: "development" },
        "development",
      ),
    ).toThrow("DATA_ENVIRONMENT");
  });

  it("rejects the production database and mixed Neon branches", () => {
    expect(() =>
      assertPreviewEnvironment(
        {
          ...safeEnvironment,
          databaseUrlUnpooled:
            "postgresql://user:password@ep-plain-glade-aswp1anv.example.neon.tech/neondb",
        },
        "development",
      ),
    ).toThrow("production Neon");
    expect(() =>
      assertPreviewEnvironment(
        {
          ...safeEnvironment,
          databaseUrlUnpooled:
            "postgresql://user:password@ep-another-preview.example.neon.tech/neondb",
        },
        "development",
      ),
    ).toThrow("same Neon branch");
  });

  it("rejects any non-preview R2 destination", () => {
    expect(() =>
      assertPreviewEnvironment(
        { ...safeEnvironment, r2BucketName: "inspora-media-production" },
        "development",
      ),
    ).toThrow("inspora-media-preview");
    expect(() =>
      assertPreviewEnvironment(
        { ...safeEnvironment, r2PublicBaseUrl: "https://media.inspora.design" },
        "development",
      ),
    ).toThrow("r2.dev");
  });
});
