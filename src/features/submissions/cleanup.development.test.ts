import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/db/client", async () => import("../../db/client"));
vi.mock("@/db/schema", async () => import("../../db/schema"));
vi.mock("@/db/write-client", async () => import("../../db/write-client"));

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  runtimeDataEnvironmentFromValues,
} from "../../../scripts/lib/environment-fingerprint";
import { requireDatabase } from "../../db/client";
import {
  cleanupJobs,
  creators,
  profileAccounts,
  submissionQuotaEvents,
  submissionReceipts,
  submissions,
} from "../../db/schema";
import {
  leaseCleanupJobs,
  withdrawSubmissionForOwner,
} from "./cleanup";

const enabled = process.env.RUN_DEVELOPMENT_PROFILE_CLEANUP_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "development";
const suite = enabled ? describe : describe.skip;

suite("profile cleanup transactions in isolated Development rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const ownerUserId = `task6-owner-${suffix}`;
  const otherUserId = `task6-other-${suffix}`;
  const creatorId = randomUUID();
  const otherCreatorId = randomUUID();
  const submissionId = randomUUID();
  const requestId = randomUUID();
  const quotaId = randomUUID();
  const jobIds = [randomUUID(), randomUUID()];

  beforeAll(async () => {
    assertEnvironmentFingerprint(
      runtimeDataEnvironmentFromValues(process.env),
      APPROVED_ENVIRONMENT_FINGERPRINTS.development,
    );
    const database = requireDatabase();
    await database.insert(profileAccounts).values([
      { userId: ownerUserId },
      { userId: otherUserId },
    ]);
    await database.insert(creators).values([
      {
        id: creatorId,
        name: "Task 6 owner",
        username: `task6_${suffix}`,
        avatarUrl: "/brand/default-avatar.svg",
        ownerUserId,
        recordOrigin: "development",
      },
      {
        id: otherCreatorId,
        name: "Task 6 other owner",
        username: `task6_other_${suffix}`.slice(0, 30),
        avatarUrl: "/brand/default-avatar.svg",
        ownerUserId: otherUserId,
        recordOrigin: "development",
      },
    ]);
    const createdAt = new Date();
    await database.insert(submissions).values({
      id: submissionId,
      ownerUserId,
      creatorId,
      requestId,
      kind: "website",
      sourceUrl: `https://task6-${suffix}.invalid`,
      sourceFingerprint: `url:task6-${suffix}`,
      status: "in_review",
      createdAt,
      updatedAt: createdAt,
    });
    await database.insert(submissionQuotaEvents).values({
      id: quotaId,
      ownerUserId,
      submissionId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    if (!enabled) return;
    const database = requireDatabase();
    await database.delete(cleanupJobs).where(inArray(cleanupJobs.id, jobIds));
    await database.delete(submissionReceipts).where(eq(submissionReceipts.ownerUserId, ownerUserId));
    await database.delete(submissionQuotaEvents).where(eq(submissionQuotaEvents.ownerUserId, ownerUserId));
    await database.delete(submissions).where(eq(submissions.ownerUserId, ownerUserId));
    await database.delete(creators).where(inArray(creators.id, [creatorId, otherCreatorId]));
    await database.delete(profileAccounts).where(inArray(profileAccounts.userId, [ownerUserId, otherUserId]));
  });

  it("isolates withdrawal and retains only the 24-hour quota/idempotency receipt", async () => {
    await expect(withdrawSubmissionForOwner(otherUserId, submissionId))
      .resolves.toMatchObject({ ok: false, code: "forbidden" });
    await expect(withdrawSubmissionForOwner(ownerUserId, submissionId))
      .resolves.toEqual({ ok: true, value: null });
    await expect(withdrawSubmissionForOwner(ownerUserId, submissionId))
      .resolves.toEqual({ ok: true, value: null });

    const database = requireDatabase();
    const remaining = await database.select().from(submissions)
      .where(eq(submissions.id, submissionId));
    const receipts = await database.select().from(submissionReceipts)
      .where(eq(submissionReceipts.submissionId, submissionId));
    const quota = await database.select().from(submissionQuotaEvents)
      .where(eq(submissionQuotaEvents.submissionId, submissionId));
    expect(remaining).toHaveLength(0);
    expect(receipts).toEqual([expect.objectContaining({ ownerUserId, requestId, state: "withdrawn" })]);
    expect(quota).toHaveLength(1);
  });

  it("lets two workers lease disjoint jobs", async () => {
    const now = new Date();
    await requireDatabase().insert(cleanupJobs).values(jobIds.map((id) => ({
      id,
      kind: "delete_public_orphan",
      targetId: randomUUID(),
      idempotencyKey: `task6-lease:${id}`,
      notBefore: now,
      nextAttemptAt: now,
    })));
    const [left, right] = await Promise.all([
      leaseCleanupJobs(now, 1),
      leaseCleanupJobs(now, 1),
    ]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0]?.id).not.toBe(right[0]?.id);
    expect(new Set([left[0]?.id, right[0]?.id])).toEqual(new Set(jobIds));
  });
});
