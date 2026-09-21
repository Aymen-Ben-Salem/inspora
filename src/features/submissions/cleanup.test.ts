import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCleanupRunner,
  createAccountDeletionFinalizer,
  rejectionExpiresAt,
  retryDelayMilliseconds,
  unreferencedAssetKeys,
  withdrawalFailure,
} from "./cleanup";

describe("profile cleanup", () => {
  it("expires 48 hours after rejection, independent of submission time", () => {
    expect(rejectionExpiresAt(new Date("2026-09-18T12:00:00Z")).toISOString())
      .toBe("2026-09-20T12:00:00.000Z");
  });

  it("passes the real boundary time to expiry work", async () => {
    const expireRejected = vi.fn().mockResolvedValue(0);
    const runner = createCleanupRunner({
      expireRejected,
      expireAbandonedUploads: vi.fn().mockResolvedValue(0),
      leaseJobs: vi.fn().mockResolvedValue([]),
      completeJob: vi.fn(),
      retryJob: vi.fn(),
      processJob: vi.fn(),
      pruneReceipts: vi.fn().mockResolvedValue(undefined),
    });

    await runner(new Date("2026-09-20T11:59:00.000Z"), 10);
    await runner(new Date("2026-09-20T12:00:00.000Z"), 10);

    expect(expireRejected).toHaveBeenNthCalledWith(
      1,
      new Date("2026-09-20T11:59:00.000Z"),
      10,
    );
    expect(expireRejected).toHaveBeenNthCalledWith(
      2,
      new Date("2026-09-20T12:00:00.000Z"),
      10,
    );
  });

  it("completes successful jobs and reschedules storage failures", async () => {
    const completeJob = vi.fn();
    const retryJob = vi.fn();
    const processJob = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("R2 unavailable"));
    const runner = createCleanupRunner({
      expireRejected: vi.fn().mockResolvedValue(1),
      expireAbandonedUploads: vi.fn().mockResolvedValue(2),
      leaseJobs: vi.fn().mockResolvedValue([
        { id: "job-1", kind: "delete_private_upload", targetId: "upload-1", attempts: 0 },
        { id: "job-2", kind: "delete_private_upload", targetId: "upload-2", attempts: 2 },
      ]),
      completeJob,
      retryJob,
      processJob,
      pruneReceipts: vi.fn().mockResolvedValue(undefined),
    });
    const now = new Date("2026-09-21T12:00:00.000Z");

    await expect(runner(now, 10)).resolves.toEqual({
      expiredSubmissions: 1,
      abandonedUploads: 2,
      completedJobs: 1,
      retryableFailures: 1,
    });
    expect(completeJob).toHaveBeenCalledWith("job-1");
    expect(retryJob).toHaveBeenCalledWith(
      "job-2",
      new Date(now.getTime() + retryDelayMilliseconds(3)),
      "R2 unavailable",
    );
  });

  it("permits only the owner to withdraw work that is still in review", () => {
    expect(withdrawalFailure({ ownerUserId: "owner-1", status: "in_review" }, "owner-1")).toBeNull();
    expect(withdrawalFailure({ ownerUserId: "owner-1", status: "in_review" }, "owner-2"))
      .toMatchObject({ ok: false, code: "forbidden" });
    expect(withdrawalFailure({ ownerUserId: "owner-1", status: "accepted" }, "owner-1"))
      .toMatchObject({ ok: false, code: "conflict" });
  });

  it("keeps every shared primary, variant, preview and poster key", () => {
    const asset = {
      storageProvider: "r2" as const,
      storageKey: "primary",
      type: "video" as const,
      variantStorageKeys: ["variant", "orphan-variant"],
      videoPreviewStorageKey: "preview",
      posterStorageKey: "poster",
    };
    expect(unreferencedAssetKeys([asset], new Set(["primary", "variant", "preview", "poster"])))
      .toEqual(["orphan-variant"]);
  });

  it("retains the deleting account when Clerk fails and finalizes after a missing user", async () => {
    const finalize = vi.fn();
    const recordFailure = vi.fn();
    const failure = new Error("Clerk unavailable");
    const failing = createAccountDeletionFinalizer({
      deleteClerk: vi.fn().mockRejectedValue(failure),
      recordFailure,
      finalize,
      isMissing: () => false,
    });
    await expect(failing("user-1")).rejects.toThrow("Clerk unavailable");
    expect(recordFailure).toHaveBeenCalledWith("user-1", "Clerk unavailable");
    expect(finalize).not.toHaveBeenCalled();

    const missing = createAccountDeletionFinalizer({
      deleteClerk: vi.fn().mockRejectedValue({ status: 404 }),
      recordFailure,
      finalize,
      isMissing: (error) => (error as { status?: number }).status === 404,
    });
    await missing("user-1");
    expect(finalize).toHaveBeenCalledWith("user-1");
  });
});
