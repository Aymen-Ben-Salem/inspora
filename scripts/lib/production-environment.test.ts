import { describe, expect, it } from "vitest";

import {
  assertProductionMediaEnvironment,
  parseProductionExecutionOptions,
  type ProductionMediaEnvironment,
} from "./production-environment";

const safeEnvironment: ProductionMediaEnvironment = {
  dataEnvironment: "production",
  databaseUrl:
    "postgresql://user:password@ep-plain-glade-aswp1anv-pooler.example.neon.tech/neondb",
  databaseUrlUnpooled:
    "postgresql://user:password@ep-plain-glade-aswp1anv.example.neon.tech/neondb",
  r2AccountId: "production-account",
  r2AccessKeyId: "production-key",
  r2SecretAccessKey: "production-secret",
  r2BucketName: "inspora-media-production",
  r2PublicBaseUrl: "https://media.inspora.design",
};

describe("production media environment", () => {
  it("accepts only the known production database and R2 configuration", () => {
    expect(() => assertProductionMediaEnvironment(safeEnvironment)).not.toThrow();
  });

  it("rejects a missing production marker", () => {
    expect(() =>
      assertProductionMediaEnvironment({
        ...safeEnvironment,
        dataEnvironment: "development",
      }),
    ).toThrow("DATA_ENVIRONMENT");
  });

  it("rejects development or unrecognized databases", () => {
    expect(() =>
      assertProductionMediaEnvironment({
        ...safeEnvironment,
        databaseUrlUnpooled:
          "postgresql://user:password@ep-holy-resonance-ascmkhrv.example.neon.tech/neondb",
      }),
    ).toThrow("production Neon");
  });

  it("rejects development or unrecognized R2 destinations", () => {
    expect(() =>
      assertProductionMediaEnvironment({
        ...safeEnvironment,
        r2BucketName: "inspora-media-dev",
      }),
    ).toThrow("inspora-media-production");
    expect(() =>
      assertProductionMediaEnvironment({
        ...safeEnvironment,
        r2PublicBaseUrl: "https://example-development.r2.dev",
      }),
    ).toThrow("media.inspora.design");
  });
});

describe("production media command options", () => {
  it("is dry-run by default", () => {
    expect(parseProductionExecutionOptions([])).toEqual({
      execute: false,
      confirmedProduction: false,
      limit: undefined,
    });
  });

  it("requires explicit production confirmation and rejects unsafe arguments", () => {
    expect(() => parseProductionExecutionOptions(["--execute"])).toThrow(
      "--confirm-production",
    );
    expect(
      parseProductionExecutionOptions([
        "--execute",
        "--confirm-production",
        "--limit=2",
      ]),
    ).toEqual({ execute: true, confirmedProduction: true, limit: 2 });
    expect(() => parseProductionExecutionOptions(["--limit=0"])).toThrow();
    expect(() => parseProductionExecutionOptions(["--force"])).toThrow();
  });
});
