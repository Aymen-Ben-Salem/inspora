import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ rollbackNext: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "ticket-03-admin" })),
}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/db/write-client")>();
  return {
    ...actual,
    withWriteTransaction: <T>(
      work: (tx: import("@/db/write-client").WriteTx) => Promise<T>,
    ) => {
      const rollback = external.rollbackNext;
      external.rollbackNext = false;
      return actual.withWriteTransaction(async (tx) => {
        const result = await work(tx);
        if (rollback) throw new Error("Forced failure before commit");
        return result;
      });
    },
  };
});

import {
  adminAuditLogs,
  creatorClaims,
  creators,
  creatorUsernameAliases,
  logos,
  posts,
  profileAccounts,
  submissions,
  websites,
} from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { getR2PublicUrl } from "@/storage/r2";
import {
  createAdminCreator,
  deleteAdminCreator,
  getAdminCreators,
  updateAdminCreator,
} from "./identity";

const enabled =
  process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "preview";

describe.skipIf(!enabled)(
  "admin creator identity in isolated guarded preview rows",
  () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const creatorIds: string[] = [];
    const accountIds: string[] = [];
    const workIds: string[] = [];
    const claimIds: string[] = [];
    const submissionIds: string[] = [];

    afterAll(async () => {
      await withWriteTransaction(async (tx) => {
        if (submissionIds.length) {
          await tx
            .delete(submissions)
            .where(inArray(submissions.id, submissionIds));
        }
        if (claimIds.length) {
          await tx.delete(creatorClaims).where(inArray(creatorClaims.id, claimIds));
        }
        if (workIds.length) {
          await tx.delete(posts).where(inArray(posts.id, workIds));
          await tx.delete(logos).where(inArray(logos.id, workIds));
          await tx.delete(websites).where(inArray(websites.id, workIds));
        }
        if (creatorIds.length) {
          await tx
            .delete(adminAuditLogs)
            .where(inArray(adminAuditLogs.resourceId, creatorIds));
          await tx.delete(creators).where(inArray(creators.id, creatorIds));
        }
        if (accountIds.length) {
          await tx
            .delete(profileAccounts)
            .where(inArray(profileAccounts.userId, accountIds));
        }
      });
    });

    it("returns measured aggregates and preserves aliases without owner-edit markers", async () => {
      const alpha = "admin_alpha_" + suffix;
      const beta = "admin_beta_" + suffix;
      const wildcardPeer = await createAdminCreator({
        name: "Underscore equality fixture",
        username: "adminxalpha_" + suffix,
        avatarUrl: "/avatar.svg",
      });
      creatorIds.push(wildcardPeer.id);
      const created = await createAdminCreator({
        name: "Admin aggregate fixture",
        username: alpha,
        avatarUrl: "/avatar.svg",
      });
      creatorIds.push(created.id);
      expect(created).not.toHaveProperty("workCount");

      const betaResult = await updateAdminCreator(created.id, {
        name: "Admin aggregate fixture",
        username: beta,
        avatarUrl: "/avatar.svg",
      });
      expect(betaResult.creator).not.toHaveProperty("workCount");
      await updateAdminCreator(created.id, {
        name: "Admin aggregate fixture",
        username: alpha,
        avatarUrl: "/avatar.svg",
      });

      const ids = [randomUUID(), randomUUID(), randomUUID()];
      workIds.push(...ids);
      const requesterUserId = "admin-claim-" + suffix;
      accountIds.push(requesterUserId);
      const claimId = randomUUID();
      claimIds.push(claimId);
      await withWriteTransaction(async (tx) => {
        await tx
          .insert(profileAccounts)
          .values({ userId: requesterUserId });
        await tx.insert(posts).values({
          id: ids[0],
          slug: "admin-post-" + suffix,
          title: "Admin post",
          creatorId: created.id,
          description: "Fixture",
          category: "Branding",
          sourceUrl: "https://example.com/post",
        });
        await tx.insert(logos).values({
          id: ids[1],
          slug: "admin-logo-" + suffix,
          title: "Admin logo",
          creatorId: created.id,
          description: "Fixture",
          industry: "Technology",
          shape: "wordmark",
          sourceUrl: "https://example.com/logo",
        });
        await tx.insert(websites).values({
          id: ids[2],
          slug: "admin-website-" + suffix,
          title: "Admin website",
          tagline: "Fixture",
          creatorId: created.id,
          description: "Fixture",
          sourceUrl: "https://example.com/website",
        });
        await tx.insert(creatorClaims).values({
          id: claimId,
          requesterUserId,
          targetCreatorId: created.id,
          verifiedXProviderId: "provider-" + suffix,
          verifiedXUsername: "fixture_" + suffix.slice(0, 5),
        });
      });

      const record = (await getAdminCreators()).find(
        (creator) => creator.id === created.id,
      );
      expect(record).toMatchObject({
        username: alpha,
        workCount: 3,
        pendingClaimCount: 1,
        editedFields: [],
      });
      await withWriteTransaction(async (tx) => {
        const aliases = await tx
          .select()
          .from(creatorUsernameAliases)
          .where(eq(creatorUsernameAliases.creatorId, created.id));
        expect(aliases).toHaveLength(2);
        expect(
          aliases
            .filter((alias) => alias.isCurrent)
            .map((alias) => alias.username),
        ).toEqual([alpha]);
      });
      await expect(deleteAdminCreator(created.id)).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("credited work"),
      });
      await withWriteTransaction(async (tx) => {
        await tx.delete(posts).where(eq(posts.creatorId, created.id));
        await tx.delete(logos).where(eq(logos.creatorId, created.id));
        await tx.delete(websites).where(eq(websites.creatorId, created.id));
      });
      await expect(deleteAdminCreator(created.id)).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("claim history"),
      });
    }, 60_000);

    it("uses stored origin for Preview locks and legacy handles for visibility", async () => {
      const hidden = await createAdminCreator({
        name: "Hidden development fixture",
        legacyHandle: "dev-" + suffix,
        avatarUrl: "/avatar.svg",
      });
      creatorIds.push(hidden.id);
      expect((await getAdminCreators()).some((row) => row.id === hidden.id)).toBe(
        false,
      );
      await expect(
        updateAdminCreator(hidden.id, {
          name: "Updated hidden fixture",
          legacyHandle: "dev-" + suffix,
          username: hidden.username,
          avatarUrl: "/avatar.svg",
        }),
      ).resolves.toMatchObject({
        creator: { id: hidden.id, name: "Updated hidden fixture" },
      });
      await expect(deleteAdminCreator(hidden.id)).resolves.toMatchObject({
        removedManagedMedia: [],
      });

      const mirroredId = randomUUID();
      creatorIds.push(mirroredId);
      await withWriteTransaction(async (tx) => {
        await tx.insert(creators).values({
          id: mirroredId,
          name: "Mirrored fixture",
          username: "mirrored_" + suffix,
          avatarUrl: "/avatar.svg",
          recordOrigin: "mirrored",
        });
      });

      await expect(
        updateAdminCreator(mirroredId, {
          name: "Changed",
          username: "mirrored_" + suffix,
          avatarUrl: "/avatar.svg",
        }),
      ).rejects.toMatchObject({ code: "environment_restricted" });
      await expect(deleteAdminCreator(mirroredId)).rejects.toMatchObject({
        code: "environment_restricted",
      });
    }, 60_000);

    it("rejects ownership and provider associations and rolls back failed writes", async () => {
      const owned = await createAdminCreator({
        name: "Owned protection fixture",
        username: "owned_" + suffix,
        avatarUrl: "/avatar.svg",
      });
      const provider = await createAdminCreator({
        name: "Provider protection fixture",
        username: "provider_" + suffix,
        avatarUrl: "/avatar.svg",
      });
      const rollback = await createAdminCreator({
        name: "Rollback fixture",
        username: "rollback_" + suffix,
        avatarUrl: "/avatar.svg",
      });
      creatorIds.push(owned.id, provider.id, rollback.id);
      await withWriteTransaction(async (tx) => {
        await tx
          .update(creators)
          .set({ ownerUserId: "owner-" + suffix })
          .where(eq(creators.id, owned.id));
        await tx
          .update(creators)
          .set({ xProviderId: "provider-protection-" + suffix })
          .where(eq(creators.id, provider.id));
      });

      await expect(deleteAdminCreator(owned.id)).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("Owned or provider-associated"),
      });
      await expect(deleteAdminCreator(provider.id)).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("Owned or provider-associated"),
      });

      external.rollbackNext = true;
      await expect(
        updateAdminCreator(rollback.id, {
          name: "Must roll back",
          username: "rolled_back_" + suffix,
          avatarUrl: "/avatar.svg",
        }),
      ).rejects.toMatchObject({ code: "database_unavailable" });
      await withWriteTransaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(creators)
          .where(eq(creators.id, rollback.id));
        expect(row).toMatchObject({
          name: "Rollback fixture",
          username: "rollback_" + suffix,
          editedFields: [],
        });
        const aliases = await tx
          .select()
          .from(creatorUsernameAliases)
          .where(eq(creatorUsernameAliases.creatorId, rollback.id));
        expect(aliases).toHaveLength(1);
        expect(aliases[0]).toMatchObject({
          username: "rollback_" + suffix,
          isCurrent: true,
        });
      });
    }, 60_000);

    it("rejects submission references and returns cleanup candidates after deletion", async () => {
      const storageKey = "creators/admin-delete-" + suffix + ".webp";
      const created = await createAdminCreator({
        name: "Delete fixture",
        username: "delete_" + suffix,
        avatarUrl: getR2PublicUrl(storageKey),
        avatarStorageProvider: "r2",
        avatarStorageKey: storageKey,
      });
      creatorIds.push(created.id);
      const ownerUserId = "admin-submission-" + suffix;
      accountIds.push(ownerUserId);
      const submissionId = randomUUID();
      submissionIds.push(submissionId);
      await withWriteTransaction(async (tx) => {
        await tx.insert(profileAccounts).values({ userId: ownerUserId });
        await tx.insert(submissions).values({
          id: submissionId,
          ownerUserId,
          creatorId: created.id,
          requestId: randomUUID(),
          kind: "design",
          sourceUrl: "https://example.com/submission",
          sourceFingerprint: "admin-submission-" + suffix,
        });
      });

      await expect(deleteAdminCreator(created.id)).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("submissions"),
      });
      await withWriteTransaction(async (tx) => {
        await tx.delete(submissions).where(eq(submissions.id, submissionId));
      });
      const result = await deleteAdminCreator(created.id);
      expect(result.removedManagedMedia).toEqual([
        { storageProvider: "r2", storageKey, type: "image" },
      ]);
      await withWriteTransaction(async (tx) => {
        expect(
          await tx.select().from(creators).where(eq(creators.id, created.id)),
        ).toHaveLength(0);
      });
    }, 60_000);
  },
);
