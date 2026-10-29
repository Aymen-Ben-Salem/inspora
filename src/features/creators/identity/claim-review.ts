import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/auth/require-admin";
import { requireDatabase } from "@/db/client";
import { creatorClaims, creators, logos, posts, submissions, websites } from "@/db/schema";

export function claimReviewVersion(claim: typeof creatorClaims.$inferSelect, target: typeof creators.$inferSelect, source: typeof creators.$inferSelect | undefined) {
  return createHash("sha256").update(JSON.stringify([claim, target, source ?? null])).digest("hex");
}

export function profileValuesForApprovedClaimMerge(target: typeof creators.$inferSelect, source: typeof creators.$inferSelect) {
  const edited = new Set(source.editedFields);
  return {
    name: edited.has("name") ? source.name : target.name,
    username: (edited.has("username") ? source.username : target.username) ?? source.username,
    url: edited.has("websiteUrl") ? source.url : target.url,
    avatarUrl: edited.has("avatarUrl") ? source.avatarUrl : target.avatarUrl,
    avatarStorageProvider: edited.has("avatarUrl") ? source.avatarStorageProvider : target.avatarStorageProvider,
    avatarStorageKey: edited.has("avatarUrl") ? source.avatarStorageKey : target.avatarStorageKey,
    editedFields: [...new Set([...target.editedFields, ...source.editedFields])],
  };
}

export async function getClaimReviewDetails(id: string) {
  await requireAdmin();
  const db = requireDatabase();
  const claim = await db.query.creatorClaims.findFirst({ where: eq(creatorClaims.id, id) });
  if (!claim) return null;
  const [target, source] = await Promise.all([
    db.query.creators.findFirst({ where: eq(creators.id, claim.targetCreatorId) }),
    db.query.creators.findFirst({ where: eq(creators.ownerUserId, claim.requesterUserId) }),
  ]);
  if (!target) return null;
  const counts = async (creatorId: string) => {
    const result = await db.execute<{ works: number; submissions: number }>(sql`
      select ((select count(*) from ${posts} where ${posts.creatorId} = ${creatorId}) +
        (select count(*) from ${logos} where ${logos.creatorId} = ${creatorId}) +
        (select count(*) from ${websites} where ${websites.creatorId} = ${creatorId}))::int as works,
        (select count(*) from ${submissions} where ${submissions.creatorId} = ${creatorId})::int as submissions
    `);
    return result.rows[0];
  };
  const [targetCounts, sourceCounts] = await Promise.all([counts(target.id), source ? counts(source.id) : Promise.resolve(null)]);
  return { claim, target, source, targetCounts, sourceCounts,
    merged: source ? profileValuesForApprovedClaimMerge(target, source) : null,
    version: claimReviewVersion(claim, target, source) };
}
