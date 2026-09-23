import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "task1-preview-admin" })),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import {
  adminAuditLogs,
  creatorClaims,
  creators,
  creatorUsernameAliases,
  profileAccounts,
} from "../../db/schema";
import { withWriteTransaction } from "../../db/write-client";
import { reviewCreatorClaim } from "./claims";

const runNonProductionIntegration =
  process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" &&
  ["development", "preview"].includes(process.env.DATA_ENVIRONMENT ?? "");
const suite = runNonProductionIntegration ? describe : describe.skip;

suite("creator claims in isolated non-production rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const requesterUserId = `task1-${suffix}`;
  const targetCreatorId = randomUUID();
  const provisionalCreatorId = randomUUID();
  const claimId = randomUUID();
  const targetUsername = `target_${suffix}`.slice(0, 30);
  const provisionalUsername = `owner_${suffix}`.slice(0, 30);
  const xUsername = `x${suffix}`.slice(0, 15);
  const providerId = `x-provider-${suffix}`;

  beforeAll(async () => {
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId: requesterUserId });
      await tx.insert(creators).values([
        {
          id: targetCreatorId,
          name: "Task 1 target fixture",
          username: targetUsername,
          xProfileUrl: `https://x.com/${xUsername}`,
          avatarUrl: "/brand/default-avatar.svg",
          recordOrigin: "preview",
        },
        {
          id: provisionalCreatorId,
          name: "Task 1 owner fixture",
          username: provisionalUsername,
          ownerUserId: requesterUserId,
          editedFields: ["username"],
          avatarUrl: "/brand/default-avatar.svg",
          recordOrigin: "user",
        },
      ]);
      await tx.insert(creatorUsernameAliases).values([
        {
          creatorId: targetCreatorId,
          username: targetUsername,
          isCurrent: true,
        },
        {
          creatorId: provisionalCreatorId,
          username: provisionalUsername,
          isCurrent: true,
        },
      ]);
      await tx.insert(creatorClaims).values({
        id: claimId,
        requesterUserId,
        targetCreatorId,
        verifiedXProviderId: providerId,
        verifiedXUsername: xUsername,
      });
    });
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      await tx
        .delete(adminAuditLogs)
        .where(
          and(
            eq(adminAuditLogs.resourceType, "creator_claim"),
            eq(adminAuditLogs.resourceId, claimId),
          ),
        );
      await tx.delete(creatorClaims).where(eq(creatorClaims.id, claimId));
      await tx
        .delete(creators)
        .where(inArray(creators.id, [targetCreatorId, provisionalCreatorId]));
      await tx
        .delete(profileAccounts)
        .where(eq(profileAccounts.userId, requesterUserId));
    });
  });

  it("serializes concurrent approvals into one canonical owner", async () => {
    const results = await Promise.all([
      reviewCreatorClaim(claimId, "approve"),
      reviewCreatorClaim(claimId, "approve"),
    ]);

    expect(results).toEqual([
      { status: "claimed", creatorId: targetCreatorId },
      { status: "claimed", creatorId: targetCreatorId },
    ]);

    await withWriteTransaction(async (tx) => {
      const [claim] = await tx
        .select()
        .from(creatorClaims)
        .where(eq(creatorClaims.id, claimId));
      const canonical = await tx
        .select()
        .from(creators)
        .where(eq(creators.id, targetCreatorId));
      const provisional = await tx
        .select()
        .from(creators)
        .where(eq(creators.id, provisionalCreatorId));

      expect(claim?.status).toBe("approved");
      expect(canonical).toHaveLength(1);
      expect(canonical[0]?.ownerUserId).toBe(requesterUserId);
      expect(canonical[0]?.xProviderId).toBe(providerId);
      expect(canonical[0]?.username).toBe(provisionalUsername);
      expect(provisional).toHaveLength(0);
    });
  });
});
