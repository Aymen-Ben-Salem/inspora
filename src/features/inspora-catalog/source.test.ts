import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/storage/r2-client", () => ({ createR2Client: vi.fn() }));
vi.mock("../../../scripts/lib/production-environment", () => ({ assertProductionMediaEnvironment: vi.fn() }));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/serverless", () => ({ neon: () => Object.assign(vi.fn(), { query: vi.fn(), transaction }) }));
import { assertCatalogSourceEnvironment, capturePublicCatalog } from "./source";

describe("shared catalog source", () => {
  const values = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", R2_SUBMISSIONS_BUCKET_NAME: "inspora-submissions-production", INSPORA_CATALOG_SOURCE_DATABASE_URL: "postgresql://inspora_catalog_reader:test@ep-plain-glade-aswp1anv-pooler.c-2.us-east-1.aws.neon.tech/test" };
  it("rejects other deployment environments, branches and source endpoints", () => {
    expect(() => assertCatalogSourceEnvironment(values)).not.toThrow();
    for (const change of [{ VERCEL_ENV: "preview" }, { VERCEL_GIT_COMMIT_REF: "preview/archive-updates" }, { R2_SUBMISSIONS_BUCKET_NAME: "wrong" }, { INSPORA_CATALOG_SOURCE_DATABASE_URL: "postgresql://test@wrong.neon.tech/test" }, { INSPORA_CATALOG_SOURCE_DATABASE_URL: values.INSPORA_CATALOG_SOURCE_DATABASE_URL.replace("inspora_catalog_reader", "owner") }]) {
      expect(() => assertCatalogSourceEnvironment({ ...values, ...change })).toThrow();
    }
  });
  it("captures in one enforced read-only repeatable-read transaction", async () => {
    vi.stubEnv("VERCEL_ENV", values.VERCEL_ENV);vi.stubEnv("VERCEL_GIT_COMMIT_REF", values.VERCEL_GIT_COMMIT_REF);vi.stubEnv("INSPORA_CATALOG_SOURCE_DATABASE_URL", values.INSPORA_CATALOG_SOURCE_DATABASE_URL);vi.stubEnv("R2_SUBMISSIONS_BUCKET_NAME", values.R2_SUBMISSIONS_BUCKET_NAME);
    try {
      const permission = { captured_at: "2026-11-12T12:00:00Z", read_only: "on", catalog_role: "inspora_catalog_reader", can_write_public: false, can_create_public: false };
      transaction.mockResolvedValue([[permission], []]);
      expect((await capturePublicCatalog()).rows).toEqual([]);
      expect(transaction).toHaveBeenLastCalledWith(expect.any(Array), { isolationLevel: "RepeatableRead", readOnly: true });
      transaction.mockResolvedValue([[permission], [{ published_at: new Date("2026-11-01T12:00:00Z"), updated_at: "2026-11-12 12:00:00.123456+00" }]]);
      expect((await capturePublicCatalog()).rows).toEqual([{ published_at: "2026-11-01T12:00:00.000Z", updated_at: "2026-11-12 12:00:00.123456+00" }]);
      transaction.mockResolvedValue([[{ ...permission, read_only: "off" }], []]);
      await expect(capturePublicCatalog()).rejects.toThrow("read-only");
      transaction.mockResolvedValue([[{ ...permission, can_write_public: true }], []]);
      await expect(capturePublicCatalog()).rejects.toThrow("read-only");
    } finally {vi.unstubAllEnvs();}
  });
});
