import { describe, expect, it } from "vitest";

import {
  assertDevelopmentMediaEnvironment,
  parseDevelopmentExecutionOptions,
  type DevelopmentMediaEnvironment,
} from "./development-environment";

const safeEnvironment: DevelopmentMediaEnvironment = {
  dataEnvironment: "development",
  databaseUrl: "postgresql://user:password@dev-pooler.example.neon.tech/neondb",
  databaseUrlUnpooled: "postgresql://user:password@dev.example.neon.tech/neondb",
  r2AccountId: "dev-account",
  r2AccessKeyId: "dev-key",
  r2SecretAccessKey: "dev-secret",
  r2BucketName: "inspora-media-dev",
  r2PublicBaseUrl: "https://example-development.r2.dev",
};

describe("development media environment", () => {
  it("accepts the isolated development database and R2 configuration", () => {
    expect(() => assertDevelopmentMediaEnvironment(safeEnvironment, "development"))
      .not.toThrow();
  });

  it("rejects production mode or a missing development marker", () => {
    expect(() => assertDevelopmentMediaEnvironment(safeEnvironment, "production"))
      .toThrow("NODE_ENV");
    expect(() =>
      assertDevelopmentMediaEnvironment(
        { ...safeEnvironment, dataEnvironment: "production" },
        "development",
      ),
    ).toThrow("DATA_ENVIRONMENT");
  });

  it("rejects production or unrecognized R2 destinations", () => {
    expect(() =>
      assertDevelopmentMediaEnvironment(
        { ...safeEnvironment, r2BucketName: "inspora-media-production" },
        "development",
      ),
    ).toThrow("inspora-media-dev");
    expect(() =>
      assertDevelopmentMediaEnvironment(
        { ...safeEnvironment, r2PublicBaseUrl: "https://media.inspora.design" },
        "development",
      ),
    ).toThrow("r2.dev");
  });
});

describe("development media command options", () => {
  it("is dry-run by default", () => {
    expect(parseDevelopmentExecutionOptions([])).toEqual({
      execute: false,
      confirmedDevelopment: false,
      limit: undefined,
    });
  });

  it("requires an explicit development confirmation before execution", () => {
    expect(() => parseDevelopmentExecutionOptions(["--execute"]))
      .toThrow("--confirm-development");
    expect(
      parseDevelopmentExecutionOptions([
        "--execute",
        "--confirm-development",
        "--limit=2",
      ]),
    ).toEqual({ execute: true, confirmedDevelopment: true, limit: 2 });
  });

  it("rejects unsafe or unknown arguments", () => {
    expect(() => parseDevelopmentExecutionOptions(["--limit=0"])).toThrow();
    expect(() => parseDevelopmentExecutionOptions(["--force"])).toThrow();
  });
});
