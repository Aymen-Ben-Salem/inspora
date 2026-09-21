import { describe, expect, it, vi } from "vitest";
import { updateTag } from "next/cache";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../../data/logos-repository", () => ({ PUBLISHED_LOGOS_CACHE_TAG: "logos" }));
vi.mock("../../data/posts-repository", () => ({ PUBLISHED_POSTS_CACHE_TAG: "posts" }));
vi.mock("../../data/websites-repository", () => ({ PUBLISHED_WEBSITES_CACHE_TAG: "websites" }));
vi.mock("../admin/logos-repository", () => ({ insertAdminLogoInTransaction: vi.fn() }));
vi.mock("../admin/posts-repository", () => ({ insertAdminPostInTransaction: vi.fn() }));
vi.mock("../admin/websites-repository", () => ({ insertAdminWebsiteInTransaction: vi.fn() }));
vi.mock("../profiles/cache", () => ({
  PUBLIC_CREATOR_PROFILES_CACHE_TAG: "public-creator-profiles",
}));

import {
  enforceReviewedPublication,
  revalidateReviewTransition,
  type ReviewPublicationInput,
} from "../admin/publishing";
import {
  collectReviewedPublicationAssets,
  createReviewService,
  type ReviewServiceDependencies,
  type ReviewSubmissionState,
} from "./review-service";

const publication: ReviewPublicationInput = {
  kind: "design",
  content: {
    slug: "reviewed-design",
    title: "Reviewed design",
    creator: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Browser supplied creator",
      avatarUrl: "/brand/default-avatar.svg",
    },
    description: "Prepared by the review team.",
    category: "Product",
    industries: ["Software"],
    colors: ["Blue"],
    styles: ["Minimal"],
    sourceUrl: "https://example.com/source",
    isFeatured: false,
    status: "published",
    media: [
      {
        type: "image",
        url: "https://example.com/reviewed-design.png",
        alt: "Reviewed design",
        width: 1200,
        height: 900,
      },
    ],
  },
};

function createFixture(options: {
  attemptId?: string | null;
  attemptIds?: (string | null)[];
  publishError?: Error;
} = {}) {
  const publishedRef = {
    kind: "design" as const,
    id: "00000000-0000-4000-8000-000000000003",
    href: "/posts/reviewed-design",
  };
  const state: {
    accountStatus: "active" | "deleting";
    submission: ReviewSubmissionState | null;
    creatorOwnerUserId: string | null;
    messages: string[];
    audits: string[];
    attachedAttempts: string[];
    cleanupAttempts: string[];
    publishedCreatorIds: string[];
    publishCount: number;
  } = {
    accountStatus: "active",
    submission: {
      id: "00000000-0000-4000-8000-000000000001",
      ownerUserId: "owner-1",
      creatorId: "00000000-0000-4000-8000-000000000010",
      kind: "design",
      status: "in_review",
      publishedRef: null,
    },
    creatorOwnerUserId: "owner-1",
    messages: [],
    audits: [],
    attachedAttempts: [],
    cleanupAttempts: [],
    publishedCreatorIds: [],
    publishCount: 0,
  };

  let transactionTail = Promise.resolve();
  let preparationCount = 0;
  const dependencies: ReviewServiceDependencies = {
    now: () => new Date("2026-09-20T12:00:00.000Z"),
    readSubmissionIdentity: async () => state.submission,
    preparePublication: async (_submissionId, input) => {
      const attemptId = options.attemptIds
        ? (options.attemptIds[preparationCount] ?? null)
        : (options.attemptId ?? null);
      preparationCount += 1;
      return { attemptId, input };
    },
    queuePreparedCleanup: async (attemptId) => {
      state.cleanupAttempts.push(attemptId);
    },
    transaction: async (work) => {
      let release!: () => void;
      const previous = transactionTail;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = structuredClone(state);
      try {
        return await work({
          lockAccount: async () => ({ status: state.accountStatus }),
          lockSubmission: async () => state.submission,
          lockCreator: async () =>
            state.creatorOwnerUserId === null
              ? null
              : { ownerUserId: state.creatorOwnerUserId },
          publish: async (_input, _actorId, creatorId) => {
            state.publishCount += 1;
            state.publishedCreatorIds.push(creatorId);
            if (options.publishError) throw options.publishError;
            return publishedRef;
          },
          markAccepted: async (_submissionId, ref) => {
            if (!state.submission || state.submission.status !== "in_review") {
              return false;
            }
            state.submission = {
              ...state.submission,
              status: "accepted",
              publishedRef: ref,
            };
            return true;
          },
          insertAcceptanceMessage: async (submissionId) => {
            if (!state.messages.includes(submissionId)) state.messages.push(submissionId);
          },
          insertAuditEvent: async (submissionId) => {
            state.audits.push(submissionId);
          },
          markRejected: async (_submissionId, _actorId, reason, rejectedAt, expiresAt) => {
            if (!state.submission || state.submission.status !== "in_review") {
              return false;
            }
            state.submission = {
              ...state.submission,
              status: "rejected",
              publishedRef: null,
              rejectionReason: reason,
              rejectedAt,
              expiresAt,
            };
            return true;
          },
          markAttemptAttached: async (attemptId) => {
            state.attachedAttempts.push(attemptId);
          },
        });
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      } finally {
        release();
      }
    },
  };

  return { service: createReviewService(dependencies), state, publishedRef };
}

describe("submission review service", () => {
  it("requires review media to be a matching managed public upload", () => {
    expect(() =>
      collectReviewedPublicationAssets(
        publication,
        (key) => `https://public.example/${key}`,
      ),
    ).toThrow("managed public upload");

    const managed = structuredClone(publication);
    if (managed.kind !== "design") throw new Error("Expected design fixture.");
    managed.content.media[0] = {
      ...managed.content.media[0]!,
      url: "https://public.example/posts/00000000-0000-4000-8000-000000000020.png",
      storageProvider: "r2",
      storageKey: "posts/00000000-0000-4000-8000-000000000020.png",
    };
    expect(
      collectReviewedPublicationAssets(
        managed,
        (key) => `https://public.example/${key}`,
      ),
    ).toEqual([
      expect.objectContaining({
        storageKey: "posts/00000000-0000-4000-8000-000000000020.png",
      }),
    ]);

    managed.content.media[0]!.url =
      "/api/submissions/00000000-0000-4000-8000-000000000001/media";
    expect(() =>
      collectReviewedPublicationAssets(
        managed,
        (key) => `https://public.example/${key}`,
      ),
    ).toThrow("does not match its public upload");
  });

  it("invalidates the cached creator profile after publication", () => {
    revalidateReviewTransition(
      "00000000-0000-4000-8000-000000000001",
      {
        kind: "design",
        id: "00000000-0000-4000-8000-000000000003",
        href: "/posts/reviewed-design",
      },
    );

    expect(updateTag).toHaveBeenCalledWith("public-creator-profiles");
  });

  it("forces accepted work to published and maps App Icons to the existing icon kind", () => {
    const logoInput: ReviewPublicationInput = {
      kind: "app-icon",
      content: {
        slug: "reviewed-icon",
        title: "Reviewed icon",
        kind: "logo",
        creator: publication.content.creator,
        description: "Prepared icon",
        industry: "Software",
        colors: ["Blue"],
        styles: ["Minimal"],
        shape: "Square",
        sourceUrl: "https://apps.apple.com/app/id123456789",
        status: "draft",
        media: {
          url: "https://example.com/icon.png",
          alt: "Reviewed icon",
          width: 1024,
          height: 1024,
        },
      },
    };

    const normalized = enforceReviewedPublication(logoInput);

    expect(normalized.content.status).toBe("published");
    expect(normalized.kind).toBe("app-icon");
    expect("kind" in normalized.content && normalized.content.kind).toBe("icon");
  });

  it("returns the stored work on retry without duplicating publication or the acceptance message", async () => {
    const { service, state, publishedRef } = createFixture();

    const first = await service.acceptAndPublish(
      state.submission!.id,
      publication,
      "reviewer-1",
    );
    const retry = await service.acceptAndPublish(
      state.submission!.id,
      publication,
      "reviewer-1",
    );

    expect(first).toEqual({ ok: true, value: publishedRef });
    expect(retry).toEqual({ ok: true, value: publishedRef });
    expect(state.publishCount).toBe(1);
    expect(state.messages).toEqual([state.submission!.id]);
    expect(state.audits).toEqual([state.submission!.id]);
  });

  it("serializes concurrent accepts into one published work and forces the stored creator", async () => {
    const { service, state, publishedRef } = createFixture();

    const results = await Promise.all([
      service.acceptAndPublish(state.submission!.id, publication, "reviewer-1"),
      service.acceptAndPublish(state.submission!.id, publication, "reviewer-2"),
    ]);

    expect(results).toEqual([
      { ok: true, value: publishedRef },
      { ok: true, value: publishedRef },
    ]);
    expect(state.publishCount).toBe(1);
    expect(state.messages).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.publishedCreatorIds).toEqual([
      "00000000-0000-4000-8000-000000000010",
    ]);
  });

  it("attaches only the winning prepared attempt and queues the concurrent loser", async () => {
    const { service, state } = createFixture({
      attemptIds: ["attempt-winner", "attempt-loser"],
    });

    await Promise.all([
      service.acceptAndPublish(state.submission!.id, publication, "reviewer-1"),
      service.acceptAndPublish(state.submission!.id, publication, "reviewer-2"),
    ]);

    expect(state.attachedAttempts).toEqual(["attempt-winner"]);
    expect(state.cleanupAttempts).toEqual(["attempt-loser"]);
  });

  it("rejects a browser-supplied content kind that differs from the stored submission", async () => {
    const { service, state } = createFixture();
    const result = await service.acceptAndPublish(
      state.submission!.id,
      { ...publication, kind: "logo" } as unknown as ReviewPublicationInput,
      "reviewer-1",
    );

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "invalid_input" }));
    expect(state.publishCount).toBe(0);
  });

  it("does not publish for a deleting account and queues its prepared public assets", async () => {
    const { service, state } = createFixture({ attemptId: "attempt-deleting" });
    state.accountStatus = "deleting";

    const result = await service.acceptAndPublish(
      state.submission!.id,
      publication,
      "reviewer-1",
    );

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "account_deleting" }));
    expect(state.publishCount).toBe(0);
    expect(state.cleanupAttempts).toEqual(["attempt-deleting"]);
  });

  it("rolls back a failed publication and queues its prepared public assets", async () => {
    const { service, state } = createFixture({
      attemptId: "attempt-failed",
      publishError: new Error("invalid editorial details"),
    });

    const result = await service.acceptAndPublish(
      state.submission!.id,
      publication,
      "reviewer-1",
    );

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "unavailable" }));
    expect(state.submission?.status).toBe("in_review");
    expect(state.messages).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.cleanupAttempts).toEqual(["attempt-failed"]);
  });

  it("does not publish when withdrawal removes the submission after preparation", async () => {
    const { state } = createFixture({ attemptId: "attempt-withdrawn" });
    const submissionId = state.submission!.id;
    const original = state.submission;
    const withdrawingService = createReviewService({
      now: () => new Date("2026-09-20T12:00:00.000Z"),
      readSubmissionIdentity: async () => original,
      preparePublication: async (_id, input) => {
        state.submission = null;
        return { attemptId: "attempt-withdrawn", input };
      },
      queuePreparedCleanup: async (attemptId) => {
        state.cleanupAttempts.push(attemptId);
      },
      transaction: async (work) => work({
        lockAccount: async () => ({ status: "active" }),
        lockSubmission: async () => null,
        lockCreator: async () => ({ ownerUserId: "owner-1" }),
        publish: async () => {
          throw new Error("publish must not run");
        },
        markAccepted: async () => false,
        insertAcceptanceMessage: async () => undefined,
        insertAuditEvent: async () => undefined,
        markRejected: async () => false,
        markAttemptAttached: async () => undefined,
      }),
    });

    const result = await withdrawingService.acceptAndPublish(
      submissionId,
      publication,
      "reviewer-1",
    );

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "conflict" }));
    expect(state.cleanupAttempts).toEqual(["attempt-withdrawn"]);
    expect(state.publishCount).toBe(0);
  });

  it("requires a rejection reason and preserves the first fixed 48-hour deadline", async () => {
    const { service, state } = createFixture();

    const blank = await service.rejectSubmission(
      state.submission!.id,
      "   ",
      "reviewer-1",
    );
    const rejected = await service.rejectSubmission(
      state.submission!.id,
      "The link does not show the submitted work.",
      "reviewer-1",
    );
    const firstRejectedAt = state.submission?.rejectedAt;
    const retry = await service.rejectSubmission(
      state.submission!.id,
      "A different reason must not replace the first.",
      "reviewer-2",
    );

    expect(blank).toEqual(expect.objectContaining({ ok: false, code: "invalid_input" }));
    expect(rejected).toEqual({ ok: true, value: null });
    expect(retry).toEqual({ ok: true, value: null });
    expect(state.submission?.rejectionReason).toBe(
      "The link does not show the submitted work.",
    );
    expect(state.submission?.rejectedAt).toEqual(firstRejectedAt);
    expect(state.submission?.expiresAt?.toISOString()).toBe(
      "2026-09-22T12:00:00.000Z",
    );
  });
});
