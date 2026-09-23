import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("../../data/logos-repository", () => ({
  PUBLISHED_LOGOS_CACHE_TAG: "published-logos",
}));
vi.mock("../../data/posts-repository", () => ({
  PUBLISHED_POSTS_CACHE_TAG: "published-posts",
}));
vi.mock("../../data/websites-repository", () => ({
  PUBLISHED_WEBSITES_CACHE_TAG: "published-websites",
}));
vi.mock("@/db/client", async () => import("../../db/client"));
vi.mock("@/db/schema", async () => import("../../db/schema"));
vi.mock("@/db/write-client", async () => import("../../db/write-client"));
vi.mock("@/storage/types", async () => import("../../storage/types"));
vi.mock("@/domain/website", async () => import("../../domain/website"));
vi.mock("@/features/creators/repository", () => ({
  resolveCreatorMutation: vi.fn(),
}));

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  runtimeDataEnvironmentFromValues,
} from "../../../scripts/lib/environment-fingerprint";
import { requireDatabase } from "../../db/client";
import {
  adminAuditLogs,
  cleanupJobs,
  creators,
  postMedia,
  posts,
  profileAccounts,
  profileMessages,
  submissionPublicationAttempts,
  submissions,
} from "../../db/schema";
import { withWriteTransaction } from "../../db/write-client";
import { getOwnProfileActivity } from "../profiles/messages-repository";
import type { ReviewPublicationInput } from "../admin/publishing";
import {
  acceptAndPublishSubmission,
  rejectSubmissionForReview,
} from "./review-service";

const runDevelopmentIntegration =
  process.env.RUN_DEVELOPMENT_SUBMISSION_REVIEW_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "development";
const suite = runDevelopmentIntegration ? describe : describe.skip;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

suite("submission review transactions in isolated Development rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const ownerUserId = `task5-${suffix}`;
  const actorId = `task5-reviewer-${suffix}`;
  const creatorId = randomUUID();
  const browserCreatorId = randomUUID();
  const submissionIds = {
    accepted: randomUUID(),
    withdrawn: randomUUID(),
    rollback: randomUUID(),
    deleting: randomUUID(),
    rejected: randomUUID(),
  };
  const acceptedSlug = `task5-accepted-${suffix}`;
  const recoveredSlug = `task5-recovered-${suffix}`;
  const publicMediaKey = `posts/${randomUUID()}.png`;
  const publicMediaUrl =
    `${process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "")}/${publicMediaKey}`;
  const postIds = new Set<string>();

  function publication(slug: string): ReviewPublicationInput {
    return {
      kind: "design",
      content: {
        slug,
        title: "Task 5 reviewed design",
        creator: {
          id: browserCreatorId,
          name: "Browser supplied creator",
          avatarUrl: "/brand/default-avatar.svg",
        },
        description: "Isolated development transaction fixture.",
        category: "Product",
        industries: ["Software"],
        colors: ["Blue"],
        styles: ["Minimal"],
        sourceUrl: `https://task5-${suffix}.invalid/source`,
        isFeatured: false,
        status: "draft",
        media: [{
          type: "image",
          url: publicMediaUrl,
          storageProvider: "r2",
          storageKey: publicMediaKey,
          alt: "Task 5 fixture",
          width: 1200,
          height: 900,
        }],
      },
    };
  }

  beforeAll(async () => {
    assertEnvironmentFingerprint(
      runtimeDataEnvironmentFromValues(process.env),
      APPROVED_ENVIRONMENT_FINGERPRINTS.development,
    );
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId: ownerUserId });
      await tx.insert(creators).values({
        id: creatorId,
        name: "Task 5 review fixture",
        username: `task5_${suffix}`.slice(0, 30),
        ownerUserId,
        avatarUrl: "/brand/default-avatar.svg",
        recordOrigin: "development",
      });
      await tx.insert(submissions).values(
        Object.entries(submissionIds).map(([name, id]) => ({
          id,
          ownerUserId,
          creatorId,
          requestId: randomUUID(),
          kind: "design",
          sourceUrl: `https://task5-${suffix}.invalid/${name}`,
          sourceFingerprint: `url:https://task5-${suffix}.invalid/${name}`,
        })),
      );
    });
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      const attemptRows = await tx
        .select({ id: submissionPublicationAttempts.id })
        .from(submissionPublicationAttempts)
        .where(inArray(
          submissionPublicationAttempts.submissionId,
          Object.values(submissionIds),
        ));
      const fixturePosts = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.slug, acceptedSlug));
      for (const row of fixturePosts) postIds.add(row.id);
      const attempts = attemptRows.map((row) => row.id);
      const published = [...postIds];
      if (attempts.length) {
        await tx.delete(cleanupJobs).where(inArray(cleanupJobs.targetId, attempts));
        await tx
          .delete(submissionPublicationAttempts)
          .where(inArray(submissionPublicationAttempts.id, attempts));
      }
      await tx
        .delete(profileMessages)
        .where(inArray(profileMessages.submissionId, Object.values(submissionIds)));
      if (published.length) {
        await tx
          .delete(adminAuditLogs)
          .where(inArray(adminAuditLogs.resourceId, published));
        await tx.delete(postMedia).where(inArray(postMedia.postId, published));
        await tx.delete(posts).where(inArray(posts.id, published));
      }
      await tx
        .delete(submissions)
        .where(inArray(submissions.id, Object.values(submissionIds)));
      await tx.delete(creators).where(eq(creators.id, creatorId));
      await tx.delete(profileAccounts).where(eq(profileAccounts.userId, ownerUserId));
    });
  });

  it("publishes once under concurrent accept, returns the stored retry, and matches owner activity", async () => {
    const input = publication(acceptedSlug);
    const concurrent = await Promise.all([
      acceptAndPublishSubmission(submissionIds.accepted, input, actorId),
      acceptAndPublishSubmission(submissionIds.accepted, input, `${actorId}-second`),
    ]);

    expect(concurrent[0].ok).toBe(true);
    expect(concurrent[1]).toEqual(concurrent[0]);
    if (!concurrent[0].ok) throw new Error(concurrent[0].message);
    postIds.add(concurrent[0].value.id);

    const retry = await acceptAndPublishSubmission(
      submissionIds.accepted,
      input,
      actorId,
    );
    expect(retry).toEqual(concurrent[0]);

    const database = requireDatabase();
    const [publishedRows, messageRows, auditRows, attempts, ownerActivity] =
      await Promise.all([
        database.select().from(posts).where(eq(posts.slug, acceptedSlug)),
        database
          .select()
          .from(profileMessages)
          .where(eq(profileMessages.submissionId, submissionIds.accepted)),
        database
          .select()
          .from(adminAuditLogs)
          .where(and(
            eq(adminAuditLogs.action, "submission.accepted"),
            eq(adminAuditLogs.resourceId, concurrent[0].value.id),
          )),
        database
          .select()
          .from(submissionPublicationAttempts)
          .where(eq(
            submissionPublicationAttempts.submissionId,
            submissionIds.accepted,
          )),
        getOwnProfileActivity(ownerUserId, new Date()),
      ]);

    expect(publishedRows).toHaveLength(1);
    expect(publishedRows[0]).toEqual(expect.objectContaining({
      id: concurrent[0].value.id,
      creatorId,
      status: "published",
    }));
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0]?.publishedHref).toBe(concurrent[0].value.href);
    expect(auditRows).toHaveLength(1);
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
      "attached",
      "attached",
    ]);
    expect(ownerActivity.messages).toEqual([
      expect.objectContaining({
        publishedHref: concurrent[0].value.href,
      }),
    ]);
  });

  it("lets a withdrawal-style deletion win the account/submission locks without partial publication", async () => {
    const locked = deferred();
    const release = deferred();
    const withdrawal = withWriteTransaction(async (tx) => {
      await tx
        .select({ userId: profileAccounts.userId })
        .from(profileAccounts)
        .where(eq(profileAccounts.userId, ownerUserId))
        .for("update");
      await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.id, submissionIds.withdrawn))
        .for("update");
      locked.resolve();
      await release.promise;
      await tx
        .delete(submissions)
        .where(eq(submissions.id, submissionIds.withdrawn));
    });
    await locked.promise;

    const acceptance = acceptAndPublishSubmission(
      submissionIds.withdrawn,
      publication(`task5-withdrawn-${suffix}`),
      actorId,
    );
    const database = requireDatabase();
    const deadline = Date.now() + 10_000;
    let prepared = false;
    while (!prepared && Date.now() < deadline) {
      const attempts = await database
        .select({ id: submissionPublicationAttempts.id })
        .from(submissionPublicationAttempts)
        .where(eq(
          submissionPublicationAttempts.submissionId,
          submissionIds.withdrawn,
        ));
      prepared = attempts.length === 1;
      if (!prepared) await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(prepared).toBe(true);
    release.resolve();

    await withdrawal;
    const result = await acceptance;
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "conflict" }));

    const [published, attempts] = await Promise.all([
      database
        .select()
        .from(posts)
        .where(eq(posts.slug, `task5-withdrawn-${suffix}`)),
      database
        .select()
        .from(submissionPublicationAttempts)
        .where(eq(
          submissionPublicationAttempts.submissionId,
          submissionIds.withdrawn,
        )),
    ]);
    expect(published).toHaveLength(0);
    expect(attempts).toEqual([
      expect.objectContaining({ status: "cleanup" }),
    ]);
  }, 20_000);

  it("rolls back invalid duplicate details and rejects a mismatched content kind", async () => {
    const wrongKind = await acceptAndPublishSubmission(
      submissionIds.rollback,
      {
        kind: "logo",
        content: {
          slug: `task5-wrong-kind-${suffix}`,
          title: "Wrong kind",
          kind: "logo",
          creator: {
            id: browserCreatorId,
            name: "Browser supplied creator",
            avatarUrl: "/brand/default-avatar.svg",
          },
          description: "Wrong content family.",
          industry: "Software",
          colors: ["Blue"],
          styles: ["Minimal"],
          shape: "Square",
          sourceUrl: "https://example.invalid/wrong-kind",
          status: "published",
          media: {
            url: "https://example.invalid/logo.png",
            alt: "Wrong kind",
            width: 100,
            height: 100,
          },
        },
      },
      actorId,
    );
    expect(wrongKind).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_input" }),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rolledBack = await acceptAndPublishSubmission(
      submissionIds.rollback,
      publication(acceptedSlug),
      actorId,
    );
    errorSpy.mockRestore();
    expect(rolledBack).toEqual(
      expect.objectContaining({ ok: false, code: "unavailable" }),
    );

    const database = requireDatabase();
    const [submission, messages, attempts, duplicatePosts] = await Promise.all([
      database
        .select()
        .from(submissions)
        .where(eq(submissions.id, submissionIds.rollback)),
      database
        .select()
        .from(profileMessages)
        .where(eq(profileMessages.submissionId, submissionIds.rollback)),
      database
        .select()
        .from(submissionPublicationAttempts)
        .where(eq(
          submissionPublicationAttempts.submissionId,
          submissionIds.rollback,
        )),
      database.select().from(posts).where(eq(posts.slug, acceptedSlug)),
    ]);
    expect(submission[0]?.status).toBe("in_review");
    expect(messages).toHaveLength(0);
    expect(attempts).toEqual([
      expect.objectContaining({ status: "cleanup" }),
    ]);
    expect(duplicatePosts).toHaveLength(1);

    const recovered = await acceptAndPublishSubmission(
      submissionIds.rollback,
      publication(recoveredSlug),
      actorId,
    );
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) throw new Error(recovered.message);
    postIds.add(recovered.value.id);

    const recoveredAttempts = await database
      .select()
      .from(submissionPublicationAttempts)
      .where(eq(
        submissionPublicationAttempts.submissionId,
        submissionIds.rollback,
      ));
    const recoveryJobs = await database
      .select()
      .from(cleanupJobs)
      .where(inArray(
        cleanupJobs.targetId,
        recoveredAttempts.map((attempt) => attempt.id),
      ));
    expect(recoveredAttempts.map((attempt) => attempt.status).sort()).toEqual([
      "attached",
      "attached",
    ]);
    expect(recoveryJobs).toHaveLength(0);
  });

  it("blocks publication while the account is deleting", async () => {
    await withWriteTransaction(async (tx) => {
      await tx
        .update(profileAccounts)
        .set({ status: "deleting" })
        .where(eq(profileAccounts.userId, ownerUserId));
    });
    try {
      const result = await acceptAndPublishSubmission(
        submissionIds.deleting,
        publication(`task5-deleting-${suffix}`),
        actorId,
      );
      expect(result).toEqual(
        expect.objectContaining({ ok: false, code: "account_deleting" }),
      );
      const attempts = await requireDatabase()
        .select()
        .from(submissionPublicationAttempts)
        .where(eq(
          submissionPublicationAttempts.submissionId,
          submissionIds.deleting,
        ));
      expect(attempts).toEqual([
        expect.objectContaining({ status: "cleanup" }),
      ]);
    } finally {
      await withWriteTransaction(async (tx) => {
        await tx
          .update(profileAccounts)
          .set({ status: "active" })
          .where(eq(profileAccounts.userId, ownerUserId));
      });
    }
  });

  it("requires a rejection reason and stores the first immutable 48-hour deadline", async () => {
    const blank = await rejectSubmissionForReview(
      submissionIds.rejected,
      "   ",
      actorId,
    );
    expect(blank).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_input" }),
    );

    const rejected = await rejectSubmissionForReview(
      submissionIds.rejected,
      "The submitted source does not show the work.",
      actorId,
    );
    const retry = await rejectSubmissionForReview(
      submissionIds.rejected,
      "This retry must not replace the original reason.",
      `${actorId}-second`,
    );
    expect(rejected).toEqual({ ok: true, value: null });
    expect(retry).toEqual({ ok: true, value: null });

    const [row] = await requireDatabase()
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionIds.rejected));
    expect(row?.rejectionReason).toBe(
      "The submitted source does not show the work.",
    );
    expect(row?.reviewedBy).toBe(actorId);
    expect(row?.expiresAt?.getTime()).toBe(
      row!.rejectedAt!.getTime() + 48 * 60 * 60 * 1000,
    );
  });
});
