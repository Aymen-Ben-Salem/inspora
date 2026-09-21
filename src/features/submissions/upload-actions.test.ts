import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensureOwnedCreator: vi.fn(),
  reserveOwnUpload: vi.fn(),
  findOwnUpload: vi.fn(),
  recordCompletedUpload: vi.fn(),
  discardUploadReservation: vi.fn(),
  signPrivateUpload: vi.fn(),
  freezePrivateUpload: vi.fn(),
  queuePrivateUploadCleanupForOwner: vi.fn(),
  createPrivateStagingKey: vi.fn(),
  PrivateSubmissionUploadValidationError: class PrivateSubmissionUploadValidationError extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/creators/repository", () => ({ ensureOwnedCreator: mocks.ensureOwnedCreator }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("./repository", () => ({
  reserveOwnUpload: mocks.reserveOwnUpload,
  findOwnUpload: mocks.findOwnUpload,
  recordCompletedUpload: mocks.recordCompletedUpload,
  discardUploadReservation: mocks.discardUploadReservation,
}));
vi.mock("@/storage/private-submissions", () => ({
  signPrivateUpload: mocks.signPrivateUpload,
  freezePrivateUpload: mocks.freezePrivateUpload,
  createPrivateStagingKey: mocks.createPrivateStagingKey,
  PrivateSubmissionUploadValidationError: mocks.PrivateSubmissionUploadValidationError,
}));
vi.mock("./cleanup", () => ({
  queuePrivateUploadCleanupForOwner: mocks.queuePrivateUploadCleanupForOwner,
}));

import {
  beginOwnUpload,
  completeOwnUpload,
  discardOwnUpload,
} from "./upload-actions";

describe("private submission upload actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_alpha" });
    mocks.createPrivateStagingKey.mockReturnValue(
      "submissions/owner/upload/staging/source.png",
    );
  });

  it("rejects unsupported logo media before reserving storage", async () => {
    await expect(
      beginOwnUpload({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "logo",
        contentType: "image/gif",
        sizeBytes: 1024,
      }),
    ).resolves.toMatchObject({ ok: false, code: "invalid_input" });
    expect(mocks.reserveOwnUpload).not.toHaveBeenCalled();
    expect(mocks.signPrivateUpload).not.toHaveBeenCalled();
  });

  it("initializes a first-time owner before reserving an upload", async () => {
    let initialized = false;
    mocks.ensureOwnedCreator.mockImplementation(async () => { initialized = true; });
    mocks.reserveOwnUpload.mockImplementation(async () => {
      expect(initialized).toBe(true);
      return { ok: false, code: "review_limit", message: "Fixture capacity" };
    });
    await beginOwnUpload({
      requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
      kind: "design", contentType: "image/png", sizeBytes: 1024,
    });
    expect(mocks.ensureOwnedCreator).toHaveBeenCalledWith("user_alpha");
  });

  it("derives the upload owner from Clerk and signs only the stored staging key", async () => {
    mocks.reserveOwnUpload.mockResolvedValue({
      ok: true,
      value: {
        id: "b5f3146c-d8b4-4727-8f31-388976cf9865",
        ownerUserId: "user_alpha",
        stagingKey: "submissions/owner/upload/staging/source.png",
        contentType: "image/png",
        sizeBytes: 1024,
        expiresAt: new Date("2099-09-20T12:00:00.000Z"),
      },
    });
    mocks.signPrivateUpload.mockResolvedValue({
      uploadUrl: "https://private-upload.invalid/signed",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });

    await expect(
      beginOwnUpload({
        requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
        kind: "design",
        contentType: "image/png",
        sizeBytes: 1024,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
        uploadUrl: "https://private-upload.invalid/signed",
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        expiresAt: "2099-09-20T12:00:00.000Z",
      },
    });
    expect(mocks.reserveOwnUpload).toHaveBeenCalledWith(
      "user_alpha",
      expect.objectContaining({ kind: "design", contentType: "image/png" }),
    );
    expect(mocks.signPrivateUpload).toHaveBeenCalledWith({
      ownerUserId: "user_alpha",
      uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      stagingKey: "submissions/owner/upload/staging/source.png",
      contentType: "image/png",
      sizeBytes: 1024,
    });
  });

  it("does not reveal whether another owner's upload exists", async () => {
    mocks.findOwnUpload.mockResolvedValue(null);

    await expect(
      completeOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toMatchObject({ ok: false, code: "forbidden" });
    await expect(
      discardOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toMatchObject({ ok: false, code: "forbidden" });
    expect(mocks.freezePrivateUpload).not.toHaveBeenCalled();
    expect(mocks.queuePrivateUploadCleanupForOwner).not.toHaveBeenCalled();
  });

  it("records trusted frozen-object metadata instead of browser claims", async () => {
    mocks.findOwnUpload.mockResolvedValue({
      id: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      ownerUserId: "user_alpha",
      kind: "logo",
      state: "pending",
      stagingKey: "submissions/owner/upload/staging/source.png",
      objectKey: null,
      contentType: "image/png",
      sizeBytes: 1024,
      expiresAt: new Date("2099-09-20T12:00:00.000Z"),
    });
    mocks.freezePrivateUpload.mockResolvedValue({
      objectKey: "submissions/owner/upload/source/original.png",
      digest: "a".repeat(64),
      contentType: "image/png",
      sizeBytes: 1024,
    });
    mocks.recordCompletedUpload.mockResolvedValue({ ok: true, value: undefined });

    await expect(
      completeOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toEqual({
      ok: true,
      value: { uploadId: "b5f3146c-d8b4-4727-8f31-388976cf9865" },
    });
    expect(mocks.freezePrivateUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "logo" }),
    );
    expect(mocks.recordCompletedUpload).toHaveBeenCalledWith(
      "user_alpha",
      "b5f3146c-d8b4-4727-8f31-388976cf9865",
      expect.objectContaining({ digest: "a".repeat(64), sizeBytes: 1024 }),
    );
  });

  it("distinguishes invalid file content from a storage outage", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findOwnUpload.mockResolvedValue({
      id: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      ownerUserId: "user_alpha",
      kind: "design",
      state: "pending",
      stagingKey: "submissions/owner/upload/staging/source.png",
      objectKey: null,
      contentType: "image/png",
      sizeBytes: 1024,
      expiresAt: new Date("2099-09-20T12:00:00.000Z"),
    });

    mocks.freezePrivateUpload.mockRejectedValueOnce(
      new mocks.PrivateSubmissionUploadValidationError("invalid file"),
    );
    await expect(
      completeOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_input" });

    mocks.freezePrivateUpload.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(
      completeOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toMatchObject({ ok: false, code: "unavailable" });
    consoleError.mockRestore();
  });

  it("returns unavailable instead of throwing when repository or cleanup work fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.reserveOwnUpload.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(beginOwnUpload({
      requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
      kind: "design",
      contentType: "image/png",
      sizeBytes: 1024,
    })).resolves.toMatchObject({ ok: false, code: "unavailable" });

    mocks.findOwnUpload.mockResolvedValueOnce({
      id: "b5f3146c-d8b4-4727-8f31-388976cf9865",
      ownerUserId: "user_alpha",
      kind: "design",
      state: "pending",
      stagingKey: "submissions/owner/upload/staging/source.png",
      objectKey: null,
      derivativeKeys: [],
      contentType: "image/png",
      sizeBytes: 1024,
      expiresAt: new Date("2099-09-20T12:00:00.000Z"),
      attachedSubmissionId: null,
    });
    mocks.discardUploadReservation.mockResolvedValueOnce({
      ok: true,
      value: {},
    });
    mocks.queuePrivateUploadCleanupForOwner.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      discardOwnUpload("b5f3146c-d8b4-4727-8f31-388976cf9865"),
    ).resolves.toMatchObject({ ok: false, code: "unavailable" });
    consoleError.mockRestore();
  });
});
