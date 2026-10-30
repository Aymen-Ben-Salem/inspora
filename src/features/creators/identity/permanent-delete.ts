import "server-only";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { requireAdmin } from "@/auth/require-admin";
import { requireDatabase } from "@/db/client";
import { withWriteTransaction } from "@/db/write-client";
import { adminAuditLogs, creatorClaims, creators, logos, logoMedia, posts, postMedia, profileAccounts, submissions, submissionPublicationAttempts, websites, websiteMedia, websiteSections } from "@/db/schema";
import { queueAccountDeletion } from "@/features/profiles/account-lifecycle";
import { removeSubmission } from "@/features/submissions/cleanup";
import { enqueueCleanup } from "@/features/submissions/cleanup-jobs";
import { collectWebsiteManagedAssets } from "@/features/admin/website-media-ownership";
import { isCreatorVisibleInEnvironment } from "@/features/admin/creator-environment-policy";
import type { ManagedMediaAsset } from "@/storage/types";
import { AdminCreatorMutationError } from "./admin";

export type PermanentCreatorDeletion = { confirmation: string; expectedUpdatedAt: string; expectedWorkCount: number };

export async function permanentlyDeleteCreator(id: string, input: PermanentCreatorDeletion) {
  const { userId: actorId } = await requireAdmin();
  const snapshot = await requireDatabase().query.creators.findFirst({ where: eq(creators.id, id) });
  if (!snapshot) throw new AdminCreatorMutationError("missing_creator", "Creator not found. Refresh Trash to see its current state.");
  // Acquire affected account locks before creator locks, matching claims,
  // submission review and account cleanup. Recheck ownership after locking.
  const submissionOwners = await requireDatabase().select({ id: submissions.ownerUserId }).from(submissions).where(eq(submissions.creatorId, id));
  const ownerIds = [...new Set([snapshot.ownerUserId, ...submissionOwners.map(row => row.id)].filter((value): value is string => Boolean(value)))].sort();
  return withWriteTransaction(async tx => {
    if (ownerIds.length) await tx.select({ id: profileAccounts.userId }).from(profileAccounts).where(inArray(profileAccounts.userId, ownerIds)).orderBy(asc(profileAccounts.userId)).for("update");
    const [creator] = await tx.select().from(creators).where(eq(creators.id, id)).for("update");
    if (!creator || !isCreatorVisibleInEnvironment(creator.handle, process.env.DATA_ENVIRONMENT)) throw new AdminCreatorMutationError("missing_creator", "Creator not found.");
    if (!creator.trashedAt) throw new AdminCreatorMutationError("conflict", "Move this creator to Trash before deleting them permanently.");
    if (creator.updatedAt.toISOString() !== input.expectedUpdatedAt || creator.ownerUserId !== snapshot.ownerUserId) throw new AdminCreatorMutationError("conflict", "This creator changed. Close this dialog, refresh Trash, and review the deletion again.");
    if (input.confirmation !== (creator.username ?? creator.name)) throw new AdminCreatorMutationError("invalid_input", "Type the creator's username exactly to confirm permanent deletion.");
    if (creator.ownerUserId === actorId) throw new AdminCreatorMutationError("conflict", "You cannot permanently delete the admin account you are currently using. Ask another administrator to handle this account.");
    if (creator.ownerUserId && process.env.DATA_ENVIRONMENT === "preview" && !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new AdminCreatorMutationError("environment_restricted", "Preview cannot delete an account from a live Clerk instance.");
    const cleanupKeys: string[] = [];
    if (creator.ownerUserId) {
      const account = await queueAccountDeletion(tx, creator.ownerUserId);
      if (!account) throw new AdminCreatorMutationError("conflict", "The linked account record is missing. Resolve its account status before permanent deletion.");
      cleanupKeys.push(`account:${creator.ownerUserId}`);
    }
    const designs = await tx.select().from(posts).where(eq(posts.creatorId, id)).for("update");
    const identities = await tx.select().from(logos).where(eq(logos.creatorId, id)).for("update");
    const sites = await tx.select().from(websites).where(eq(websites.creatorId, id)).for("update");
    const designIds = designs.map(row => row.id), logoIds = identities.map(row => row.id), siteIds = sites.map(row => row.id);
    if (designIds.length + logoIds.length + siteIds.length !== input.expectedWorkCount) throw new AdminCreatorMutationError("conflict", "The creator's work changed. Refresh Trash and review the work count before deleting.");
    const [designMedia, identityMedia, siteMedia, sections] = await Promise.all([
      designIds.length ? tx.select().from(postMedia).where(inArray(postMedia.postId, designIds)) : [],
      logoIds.length ? tx.select().from(logoMedia).where(inArray(logoMedia.logoId, logoIds)) : [],
      siteIds.length ? tx.select().from(websiteMedia).where(inArray(websiteMedia.websiteId, siteIds)) : [],
      siteIds.length ? tx.select().from(websiteSections).where(inArray(websiteSections.websiteId, siteIds)) : [],
    ]);
    const assets: ManagedMediaAsset[] = [
      ...collectWebsiteManagedAssets([...designMedia, ...identityMedia].map(row => ({ ...row, role: "image", videoPreview: "videoPreview" in row ? row.videoPreview : null, posterStorageKey: "posterStorageKey" in row ? row.posterStorageKey : null }))),
      ...collectWebsiteManagedAssets(siteMedia, sections),
      ...(creator.avatarStorageProvider === "r2" && creator.avatarStorageKey ? [{ storageProvider: "r2" as const, storageKey: creator.avatarStorageKey, type: "image" as const }] : []),
    ];
    const publishedMatch = or(
      designIds.length ? and(eq(submissions.publishedKind, "design"), inArray(submissions.publishedId, designIds)) : undefined,
      logoIds.length ? and(eq(submissions.publishedKind, "logo"), inArray(submissions.publishedId, logoIds)) : undefined,
      siteIds.length ? and(eq(submissions.publishedKind, "website"), inArray(submissions.publishedId, siteIds)) : undefined,
    );
    const intake = await tx.select().from(submissions).where(or(eq(submissions.creatorId, id), publishedMatch)).orderBy(asc(submissions.id)).for("update");
    const now = new Date();
    for (const submission of intake) {
      // Detached accepted attempts must no longer pin deleted work's assets.
      // The cleanup worker still preserves any assets referenced by other work.
      await tx.update(submissionPublicationAttempts).set({ status: "cleanup", publishedKind: null, publishedId: null, publishedHref: null, updatedAt: now }).where(eq(submissionPublicationAttempts.submissionId, submission.id));
      cleanupKeys.push(...await removeSubmission(tx, submission, now, true));
    }
    if (designIds.length) await tx.delete(posts).where(inArray(posts.id, designIds));
    if (logoIds.length) await tx.delete(logos).where(inArray(logos.id, logoIds));
    if (siteIds.length) await tx.delete(websites).where(inArray(websites.id, siteIds));
    await tx.delete(creatorClaims).where(eq(creatorClaims.targetCreatorId, id));
    await tx.delete(creators).where(eq(creators.id, id));
    if (assets.length) {
      const key = `creator-media:${id}`;
      await enqueueCleanup(tx, { kind: "delete_creator_media", targetId: id, idempotencyKey: key, assets, notBefore: now.toISOString() });
      cleanupKeys.push(key);
    }
    await tx.insert(adminAuditLogs).values({ actorId, action: "creator.permanently_deleted", resourceType: "creator", resourceId: id, details: { username: creator.username, closedAccountId: creator.ownerUserId, designs: designIds.length, logos: logoIds.length, websites: siteIds.length, submissions: intake.length, cleanupKeys: [...new Set(cleanupKeys)] } });
    return { cleanupKeys: [...new Set(cleanupKeys)], accountClosureRequested: Boolean(creator.ownerUserId) };
  });
}
