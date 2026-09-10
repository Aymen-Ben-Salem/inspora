import { describe, expect, it } from "vitest";

import {
  assertDataOperationEnvironment,
  assertEnvironmentFingerprint,
  runtimeDataEnvironmentFromValues,
  type EnvironmentFingerprint,
  type FingerprintedEnvironment,
} from "./environment-fingerprint";

const approved: EnvironmentFingerprint = {
  dataEnvironment: "development",
  neonEndpointSha256:
    "d744a333674fbc34e941319cfb5a2d8455660faef74f75ccac422f3cb74f77e3",
  r2BucketSha256:
    "fbbc3334e2325e09e43cb32dd41ba6e63d0f3ffad0bf108a1cb0db971610f8b7",
  publicMediaHostSha256:
    "425008e1364364fa8e8f714f526d5ad8256cc3961ba4569a5805f5ff4e741117",
};

const safeEnvironment: FingerprintedEnvironment = {
  dataEnvironment: "development",
  databaseUrl:
    "postgresql://fixture:secret@ep-safe-pooler.example.neon.tech/neondb",
  databaseUrlUnpooled:
    "postgresql://fixture:secret@ep-safe.example.neon.tech/neondb",
  r2BucketName: "fixture-bucket",
  r2PublicBaseUrl: "https://fixture-media.r2.dev",
};

describe("environment fingerprints", () => {
  it("uses the pooled Neon URL when runtime configuration omits the direct URL", () => {
    const environment = runtimeDataEnvironmentFromValues({
      DATA_ENVIRONMENT: "development",
      DATABASE_URL: safeEnvironment.databaseUrl,
      R2_BUCKET_NAME: safeEnvironment.r2BucketName,
      R2_PUBLIC_BASE_URL: safeEnvironment.r2PublicBaseUrl,
    });

    expect(environment.databaseUrlUnpooled).toBe(safeEnvironment.databaseUrl);
    expect(() => assertEnvironmentFingerprint(environment, approved)).not.toThrow();
  });

  it("accepts only the exact approved destination identifiers", () => {
    expect(() => assertEnvironmentFingerprint(safeEnvironment, approved)).not.toThrow();
  });

  it.each([
    ["data marker", { dataEnvironment: "preview" }, "DATA_ENVIRONMENT"],
    [
      "pooled Neon endpoint",
      {
        databaseUrl:
          "postgresql://fixture:secret@ep-other-pooler.example.neon.tech/neondb",
      },
      "Neon endpoint",
    ],
    [
      "direct Neon endpoint",
      {
        databaseUrlUnpooled:
          "postgresql://fixture:secret@ep-other.example.neon.tech/neondb",
      },
      "Neon endpoint",
    ],
    ["R2 bucket", { r2BucketName: "other-bucket" }, "R2 bucket"],
    [
      "Public media host",
      { r2PublicBaseUrl: "https://other-media.r2.dev" },
      "Public media host",
    ],
  ])("rejects a mismatched %s without echoing its value", (_label, patch, message) => {
    const mismatched = { ...safeEnvironment, ...patch };
    let thrown: unknown;

    try {
      assertEnvironmentFingerprint(mismatched, approved);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(message);
    for (const value of Object.values(mismatched)) {
      expect((thrown as Error).message).not.toContain(value);
    }
  });

  it.each([
    ["missing Neon URL", { databaseUrl: "" }],
    ["invalid Neon URL", { databaseUrl: "not-a-url" }],
    ["missing bucket", { r2BucketName: "" }],
    ["invalid public host", { r2PublicBaseUrl: "not-a-url" }],
  ])("fails closed for an unverifiable %s", (_label, patch) => {
    expect(() =>
      assertEnvironmentFingerprint({ ...safeEnvironment, ...patch }, approved),
    ).toThrow("could not be verified");
  });

  it("guards development runtime operations with the complete exact fingerprint", () => {
    expect(() =>
      assertDataOperationEnvironment(safeEnvironment, {
        approvedFingerprints: { development: approved, preview: approved },
        nodeEnvironment: "development",
      }),
    ).not.toThrow();
    expect(() =>
      assertDataOperationEnvironment(
        { ...safeEnvironment, r2BucketName: "wrong-bucket" },
        {
          approvedFingerprints: { development: approved, preview: approved },
          nodeEnvironment: "development",
        },
      ),
    ).toThrow("R2 bucket");
  });

  it("rejects production-marked data operations outside a production deployment", () => {
    expect(() =>
      assertDataOperationEnvironment(
        { ...safeEnvironment, dataEnvironment: "production" },
        { nodeEnvironment: "development" },
      ),
    ).toThrow("Production data operations");
  });
});
