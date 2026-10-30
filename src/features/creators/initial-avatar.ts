import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { creators, profileAccounts } from "@/db/schema";
import { requireDatabase } from "@/db/client";
import { withWriteTransaction } from "@/db/write-client";
import { protectPublicationMedia } from "@/features/submissions/publication-assets";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";
import { defaultCreatorAvatar, importCreatorAvatarUrl } from "./avatar-import";
import { DEFAULT_CREATOR_AVATAR } from "./avatar-policy";
import { lookupXAccountById } from "./x-api";

type ProviderUser = {
  imageUrl: string;
  externalAccounts?: { provider: string; providerUserId: string; verification: { status: string } | null }[];
};

export async function initialCreatorAvatar(user: ProviderUser) {
  if (user.imageUrl) {
    try {
      // A usable custom/provider photo wins, including an uploaded Clerk photo.
      // Do not request an enlarged proxy rendition: that can disguise a tiny source.
      return await importCreatorAvatarUrl(user.imageUrl);
    } catch { /* An undersized provider thumbnail can fall back to verified X. */ }
  }
  const x = user.externalAccounts?.find(account => ["oauth_x", "x", "twitter"].includes(account.provider.toLowerCase()) &&
    account.verification?.status === "verified" && /^[1-9]\d{0,24}$/.test(account.providerUserId));
  if (x) {
    try {
      const account = await lookupXAccountById(x.providerUserId);
      if (account.profileImageUrl) return await importCreatorAvatarUrl(account.profileImageUrl);
    } catch { /* Missing, low-resolution or unavailable photos never block signup. */ }
  }
  return defaultCreatorAvatar;
}

export async function initializeCreatorAvatar(id: string, ownerUserId: string, user: ProviderUser) {
  const eligible = and(eq(creators.id, id), eq(creators.ownerUserId, ownerUserId),
    eq(creators.avatarUrl, DEFAULT_CREATOR_AVATAR), isNull(creators.trashedAt),
    sql`not (${creators.editedFields} @> array['avatarUrl']::text[])`);
  if (!await requireDatabase().query.creators.findFirst({ where: eligible, columns: { id: true } })) return;
  const avatar = await initialCreatorAvatar(user);
  if (!avatar.avatarStorageKey) return;
  const retained = await withWriteTransaction(async tx => {
    const [account] = await tx.select({ status: profileAccounts.status }).from(profileAccounts).where(eq(profileAccounts.userId, ownerUserId)).for("update");
    if (account?.status !== "active") return false;
    const [creator] = await tx.select({ id: creators.id }).from(creators).where(eligible).for("update");
    if (!creator) return false;
    await protectPublicationMedia(tx, [{ storageProvider: "r2", storageKey: avatar.avatarStorageKey! }]);
    await tx.update(creators).set({ ...avatar, updatedAt: new Date() }).where(eligible);
    return true;
  });
  // Only discard a confirmed unused candidate. A connection failure during
  // commit can leave its outcome unknown; orphan cleanup handles that case.
  if (!retained) await deleteManagedMediaAssetsSafely([{ storageProvider: "r2", storageKey: avatar.avatarStorageKey, type: "image" }]);
  return retained;
}
