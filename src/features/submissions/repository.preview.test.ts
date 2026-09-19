import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPROVED_ENVIRONMENT_FINGERPRINTS,
  assertEnvironmentFingerprint,
  runtimeDataEnvironmentFromValues,
} from "../../../scripts/lib/environment-fingerprint";
import {
  creators,
  profileAccounts,
  submissionQuotaEvents,
  submissions,
} from "../../db/schema";
import { withWriteTransaction } from "../../db/write-client";
import { createSubmissionForOwner } from "./repository";

const runPreviewIntegration =
  process.env.RUN_PREVIEW_SUBMISSION_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "preview";
const suite = runPreviewIntegration ? describe : describe.skip;

suite("submission locking in isolated Preview rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const ownerUserId = `task3-${suffix}`;
  const creatorId = randomUUID();
  const existingSubmissionIds = Array.from({ length: 4 }, () => randomUUID());
  const contenderRequestIds = [randomUUID(), randomUUID()];
  const capturedSubmissionIds = new Set<string>(existingSubmissionIds);

  beforeAll(async () => {
    assertEnvironmentFingerprint(
      runtimeDataEnvironmentFromValues(process.env),
      APPROVED_ENVIRONMENT_FINGERPRINTS.preview,
    );
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId: ownerUserId });
      await tx.insert(creators).values({
        id: creatorId,
        name: "Task 3 concurrency fixture",
        username: `task3_${suffix}`.slice(0, 30),
        ownerUserId,
        avatarUrl: "/brand/default-avatar.svg",
        recordOrigin: "preview",
      });
      await tx.insert(submissions).values(
        existingSubmissionIds.map((id, index) => ({
          id,
          ownerUserId,
          creatorId,
          requestId: randomUUID(),
          kind: "website",
          sourceUrl: `https://task3-${suffix}.invalid/existing-${index}`,
          sourceFingerprint: `url:https://task3-${suffix}.invalid/existing-${index}`,
        })),
      );
    });
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      const contenders = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(inArray(submissions.requestId, contenderRequestIds));
      for (const row of contenders) capturedSubmissionIds.add(row.id);
      const exactIds = [...capturedSubmissionIds];
      await tx
        .delete(submissionQuotaEvents)
        .where(inArray(submissionQuotaEvents.submissionId, exactIds));
      await tx.delete(submissions).where(inArray(submissions.id, exactIds));
      await tx.delete(creators).where(eq(creators.id, creatorId));
      await tx
        .delete(profileAccounts)
        .where(eq(profileAccounts.userId, ownerUserId));
    });
  });

  it("allows only one simultaneous contender into the fifth review slot", async () => {
    const results = await Promise.all(
      contenderRequestIds.map((requestId, index) =>
        createSubmissionForOwner(ownerUserId, {
          requestId,
          kind: "website",
          source: "link",
          originalUrl: `https://task3-${suffix}.invalid/contender-${index}`,
          canonicalUrl: `https://task3-${suffix}.invalid/contender-${index}`,
          fingerprint: `url:https://task3-${suffix}.invalid/contender-${index}`,
        }),
      ),
    );
    for (const result of results) {
      if (result.ok) capturedSubmissionIds.add(result.value.id);
    }
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: "review_limit" }),
    ]);
  });
});
