import { describe, expect, it } from "vitest";

import {
  loadPreviewEnvironment,
} from "./preview-environment";
import type { EnvironmentFingerprint } from "./environment-fingerprint";

const fixtureFingerprint: EnvironmentFingerprint = {
  dataEnvironment: "preview",
  neonEndpointSha256:
    "d744a333674fbc34e941319cfb5a2d8455660faef74f75ccac422f3cb74f77e3",
  r2BucketSha256:
    "fbbc3334e2325e09e43cb32dd41ba6e63d0f3ffad0bf108a1cb0db971610f8b7",
  publicMediaHostSha256:
    "425008e1364364fa8e8f714f526d5ad8256cc3961ba4569a5805f5ff4e741117",
};

describe("preview environment", () => {
  it("loads an isolated file only after its exact fingerprint passes", () => {
    const environment = loadPreviewEnvironment({
      path: "isolated-preview.env",
      approvedFingerprint: fixtureFingerprint,
      readFile: () => `
DATA_ENVIRONMENT=preview
DATABASE_URL=postgresql://fixture:secret@ep-safe-pooler.example.neon.tech/neondb
DATABASE_URL_UNPOOLED=postgresql://fixture:secret@ep-safe.example.neon.tech/neondb
R2_ACCOUNT_ID=fixture-account
R2_ACCESS_KEY_ID=fixture-key
R2_SECRET_ACCESS_KEY=fixture-secret
R2_BUCKET_NAME=fixture-bucket
R2_PUBLIC_BASE_URL=https://fixture-media.r2.dev
`,
    });

    expect(environment.r2AccountId).toBe("fixture-account");
  });
});
