import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canReadSubmissionMedia,
  createSubmissionRepository,
  type SubmissionDataStore,
  type SubmissionRecord,
  type SubmissionTransaction,
  type UploadIntentRecord,
} from "./repository";
import type { QuotaSnapshot } from "./types";

type FakeState = {
  accountStatus: "active" | "deleting";
  creatorId: string;
  quota: QuotaSnapshot;
  submissions: SubmissionRecord[];
  uploads: UploadIntentRecord[];
};

function createFakeStore(state: FakeState): SubmissionDataStore {
  let tail = Promise.resolve();

  return {
    transaction: async (work) => {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const tx: SubmissionTransaction = {
        lockAccount: async () => ({
          status: state.accountStatus,
          creatorId: state.creatorId,
        }),
        findSubmissionByRequest: async (ownerUserId, requestId) =>
          state.submissions.find(
            (item) =>
              item.ownerUserId === ownerUserId && item.requestId === requestId,
          ) ?? null,
        readQuota: async () => ({ ...state.quota }),
        findOwnedUpload: async (ownerUserId, uploadId) =>
          state.uploads.find(
            (item) => item.ownerUserId === ownerUserId && item.id === uploadId,
          ) ?? null,
        findUploadByRequest: async (ownerUserId, requestId) =>
          state.uploads.find(
            (item) =>
              item.ownerUserId === ownerUserId && item.requestId === requestId,
          ) ?? null,
        findActiveDuplicate: async (ownerUserId, fingerprint) =>
          state.submissions.find(
            (item) =>
              item.ownerUserId === ownerUserId &&
              item.sourceFingerprint === fingerprint &&
              (item.status === "in_review" || item.status === "accepted"),
          ) ?? null,
        insertSubmission: async (input) => {
          const record: SubmissionRecord = {
            ...input,
            status: "in_review",
            publishedHref: null,
          };
          state.submissions.push(record);
          state.quota.inReview += 1;
          return record;
        },
        insertQuotaEvent: async () => {
          state.quota.submittedLast24Hours += 1;
        },
        attachUpload: async (_ownerUserId, uploadId, submissionId) => {
          const upload = state.uploads.find((item) => item.id === uploadId);
          if (!upload || upload.attachedSubmissionId) return false;
          upload.attachedSubmissionId = submissionId;
          state.quota.activeUploads -= 1;
          return true;
        },
        insertUpload: async (input) => {
          const upload: UploadIntentRecord = {
            ...input,
            state: "pending",
            objectKey: null,
            derivativeKeys: [],
            verifiedContentType: null,
            verifiedSizeBytes: null,
            digest: null,
            attachedSubmissionId: null,
          };
          state.uploads.push(upload);
          state.quota.activeUploads += 1;
          return upload;
        },
        completeUpload: async () => true,
        discardUpload: async (_ownerUserId, uploadId) => {
          const upload = state.uploads.find((item) => item.id === uploadId);
          if (!upload || upload.state === "discarded" || upload.attachedSubmissionId) {
            return false;
          }
          upload.state = "discarded";
          state.quota.activeUploads -= 1;
          return true;
        },
      };

      try {
        return await work(tx);
      } finally {
        release();
      }
    },
  };
}

function fixtureState(patch: Partial<FakeState> = {}): FakeState {
  return {
    accountStatus: "active",
    creatorId: "115fa1f9-fbd9-40d7-bc8b-ddb29f546d19",
    quota: {
      submittedLast24Hours: 0,
      inReview: 0,
      activeUploads: 0,
      nextDailySlotAt: null,
    },
    submissions: [],
    uploads: [],
    ...patch,
  };
}

function linkInput(requestId: string, canonicalUrl: string) {
  return {
    requestId,
    kind: "website" as const,
    source: "link" as const,
    originalUrl: canonicalUrl,
    canonicalUrl,
    fingerprint: `url:${canonicalUrl}`,
  };
}

describe("submission repository limits and idempotency", () => {
  it("keeps private media hidden from the public and other owners", () => {
    expect(canReadSubmissionMedia("user_alpha", null, false)).toBe(false);
    expect(canReadSubmissionMedia("user_alpha", "user_beta", false)).toBe(false);
    expect(canReadSubmissionMedia("user_alpha", "user_alpha", false)).toBe(true);
    expect(canReadSubmissionMedia("user_alpha", "reviewer", true)).toBe(true);
  });

  it("resolves an interrupted retry before evaluating either quota", async () => {
    const existing: SubmissionRecord = {
      id: "657be44b-03a5-4e9d-9808-765858130b80",
      ownerUserId: "user_alpha",
      creatorId: "115fa1f9-fbd9-40d7-bc8b-ddb29f546d19",
      requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
      kind: "website",
      sourceUrl: "https://example.com/work",
      uploadId: null,
      sourceFingerprint: "url:https://example.com/work",
      status: "accepted",
      publishedHref: "/websites/example",
    };
    const state = fixtureState({
      submissions: [existing],
      quota: {
        submittedLast24Hours: 5,
        inReview: 5,
        activeUploads: 0,
        nextDailySlotAt: "2026-09-20T12:00:00.000Z",
      },
    });
    const repository = createSubmissionRepository(createFakeStore(state));

    await expect(
      repository.create("user_alpha", linkInput(existing.requestId, existing.sourceUrl!)),
    ).resolves.toEqual({
      ok: true,
      value: {
        id: existing.id,
        status: "accepted",
        ownerHref: "/websites/example",
      },
    });
    expect(state.submissions).toHaveLength(1);
  });

  it("returns a daily-limit timestamp distinct from review capacity", async () => {
    const state = fixtureState({
      quota: {
        submittedLast24Hours: 5,
        inReview: 0,
        activeUploads: 0,
        nextDailySlotAt: "2026-09-20T12:00:00.000Z",
      },
    });
    const repository = createSubmissionRepository(createFakeStore(state));

    await expect(
      repository.create(
        "user_alpha",
        linkInput(randomUUID(), "https://example.com/daily"),
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "daily_limit",
      retryAt: "2026-09-20T12:00:00.000Z",
    });
  });

  it("shares five review slots between submissions and reserved uploads", async () => {
    const state = fixtureState({
      quota: {
        submittedLast24Hours: 1,
        inReview: 4,
        activeUploads: 1,
        nextDailySlotAt: null,
      },
    });
    const repository = createSubmissionRepository(createFakeStore(state));

    await expect(
      repository.create(
        "user_alpha",
        linkInput(randomUUID(), "https://example.com/review"),
      ),
    ).resolves.toMatchObject({ ok: false, code: "review_limit" });
  });

  it("serializes simultaneous contenders for the fifth review slot", async () => {
    const state = fixtureState({
      quota: {
        submittedLast24Hours: 0,
        inReview: 4,
        activeUploads: 0,
        nextDailySlotAt: null,
      },
    });
    const repository = createSubmissionRepository(createFakeStore(state));

    const results = await Promise.all([
      repository.create(
        "user_alpha",
        linkInput(randomUUID(), "https://example.com/first"),
      ),
      repository.create(
        "user_alpha",
        linkInput(randomUUID(), "https://example.com/second"),
      ),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: "review_limit" }),
    ]);
    expect(state.quota.inReview).toBe(5);
  });

  it("blocks an identical active source but permits a previously rejected source", async () => {
    const duplicate = linkInput(randomUUID(), "https://example.com/duplicate");
    const activeState = fixtureState({
      submissions: [
        {
          id: randomUUID(),
          ownerUserId: "user_alpha",
          creatorId: "115fa1f9-fbd9-40d7-bc8b-ddb29f546d19",
          requestId: randomUUID(),
          kind: "website",
          sourceUrl: duplicate.originalUrl,
          uploadId: null,
          sourceFingerprint: duplicate.fingerprint,
          status: "in_review",
          publishedHref: null,
        },
      ],
    });
    await expect(
      createSubmissionRepository(createFakeStore(activeState)).create(
        "user_alpha",
        duplicate,
      ),
    ).resolves.toMatchObject({ ok: false, code: "duplicate" });

    activeState.submissions[0]!.status = "accepted";
    activeState.quota.inReview = 0;
    await expect(
      createSubmissionRepository(createFakeStore(activeState)).create(
        "user_alpha",
        { ...duplicate, requestId: randomUUID() },
      ),
    ).resolves.toMatchObject({ ok: false, code: "duplicate" });

    activeState.submissions[0]!.status = "rejected";
    activeState.quota.inReview = 0;
    await expect(
      createSubmissionRepository(createFakeStore(activeState)).create(
        "user_alpha",
        { ...duplicate, requestId: randomUUID() },
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("blocks an identical completed file while the earlier submission is accepted", async () => {
    const digest = "b".repeat(64);
    const uploadId = randomUUID();
    const state = fixtureState({
      submissions: [
        {
          id: randomUUID(), ownerUserId: "user_alpha",
          creatorId: "115fa1f9-fbd9-40d7-bc8b-ddb29f546d19",
          requestId: randomUUID(), kind: "design", sourceUrl: null,
          uploadId: randomUUID(), sourceFingerprint: `file:${digest}`,
          status: "accepted", publishedHref: "/posts/published",
        },
      ],
      uploads: [
        {
          id: uploadId, ownerUserId: "user_alpha", requestId: randomUUID(),
          kind: "design", state: "completed", stagingKey: "staging-key",
          objectKey: "object-key", derivativeKeys: [], contentType: "image/png",
          sizeBytes: 12, verifiedContentType: "image/png", verifiedSizeBytes: 12,
          digest, expiresAt: new Date("2026-09-20T12:00:00.000Z"),
          attachedSubmissionId: null,
        },
      ],
      quota: {
        submittedLast24Hours: 1, inReview: 0, activeUploads: 1,
        nextDailySlotAt: null,
      },
    });
    const repository = createSubmissionRepository(createFakeStore(state), {
      now: () => new Date("2026-09-19T12:00:00.000Z"),
    });

    await expect(repository.create("user_alpha", {
      requestId: randomUUID(), kind: "design", source: "upload", uploadId,
    })).resolves.toMatchObject({ ok: false, code: "duplicate" });
  });

  it("transfers a completed upload reservation into review without double-counting", async () => {
    const uploadId = randomUUID();
    const state = fixtureState({
      quota: {
        submittedLast24Hours: 0,
        inReview: 4,
        activeUploads: 1,
        nextDailySlotAt: null,
      },
      uploads: [
        {
          id: uploadId,
          ownerUserId: "user_alpha",
          requestId: randomUUID(),
          kind: "design",
          state: "completed",
          stagingKey: "staging-key",
          objectKey: "object-key",
          derivativeKeys: [],
          contentType: "image/png",
          sizeBytes: 12,
          verifiedContentType: "image/png",
          verifiedSizeBytes: 12,
          digest: "a".repeat(64),
          expiresAt: new Date("2026-09-20T12:00:00.000Z"),
          attachedSubmissionId: null,
        },
      ],
    });
    const repository = createSubmissionRepository(createFakeStore(state), {
      now: () => new Date("2026-09-19T12:00:00.000Z"),
    });

    await expect(
      repository.create("user_alpha", {
        requestId: randomUUID(),
        kind: "design",
        source: "upload",
        uploadId,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(state.quota).toMatchObject({ inReview: 5, activeUploads: 0 });
  });

  it("reports the current state when an upload reservation retry has expired", async () => {
    const requestId = randomUUID();
    const state = fixtureState({
      uploads: [
        {
          id: randomUUID(), ownerUserId: "user_alpha", requestId,
          kind: "design", state: "pending", stagingKey: "staging-key",
          objectKey: null, derivativeKeys: [], contentType: "image/png",
          sizeBytes: 12, verifiedContentType: null, verifiedSizeBytes: null,
          digest: null, expiresAt: new Date("2026-09-19T11:00:00.000Z"),
          attachedSubmissionId: null,
        },
      ],
    });
    const repository = createSubmissionRepository(createFakeStore(state), {
      now: () => new Date("2026-09-19T12:00:00.000Z"),
    });

    await expect(repository.reserveUpload("user_alpha", {
      id: randomUUID(), requestId, kind: "design", stagingKey: "new-key",
      contentType: "image/png", sizeBytes: 12,
      expiresAt: new Date("2026-09-20T12:00:00.000Z"),
    })).resolves.toMatchObject({
      ok: false,
      code: "upload_expired",
      retryAt: "2026-09-19T11:00:00.000Z",
    });
  });

  it("does not re-sign a discarded upload reservation on retry", async () => {
    const requestId = randomUUID();
    const state = fixtureState({
      uploads: [
        {
          id: randomUUID(), ownerUserId: "user_alpha", requestId,
          kind: "design", state: "discarded", stagingKey: "staging-key",
          objectKey: null, derivativeKeys: [], contentType: "image/png",
          sizeBytes: 12, verifiedContentType: null, verifiedSizeBytes: null,
          digest: null, expiresAt: new Date("2026-09-20T12:00:00.000Z"),
          attachedSubmissionId: null,
        },
      ],
    });
    const repository = createSubmissionRepository(createFakeStore(state), {
      now: () => new Date("2026-09-19T12:00:00.000Z"),
    });

    await expect(repository.reserveUpload("user_alpha", {
      id: randomUUID(), requestId, kind: "design", stagingKey: "new-key",
      contentType: "image/png", sizeBytes: 12,
      expiresAt: new Date("2026-09-20T12:00:00.000Z"),
    })).resolves.toMatchObject({ ok: false, code: "conflict" });
  });
});
