import "server-only";

import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { after } from "next/server";
import { getDatabase, requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import type { CreatorSummary, ResolvedCreatorProfile } from "../types";
import { creatorUsernameCandidates } from "../validation";
import { mapCreatorSummary, mapPublicCreatorProfile } from "./projections";

// Compatibility exports preserve existing owner mutation contracts and policy.
export { ProfileMutationError, updateOwnedCreatorProfile, updateOwnedCreatorAvatar } from "./owned-profile";

/** Established by a server authentication adapter, never by request body fields. */
export type CreatorOwnerPrincipal = Readonly<{ userId: string }>;

export async function getCreatorSummary(id: string): Promise<CreatorSummary | null> {
  const database = requireDatabase();
  const row = await database.query.creators.findFirst({
    where: eq(creators.id, id),
  });
  return row ? mapCreatorSummary(row) : null;
}

class UsernameReservationConflict extends Error {}

export async function ensureCreatorForOwner(principal: CreatorOwnerPrincipal): Promise<CreatorSummary> {
  const ownerUserId = principal.userId;
  if (!ownerUserId?.trim()) throw new Error("Sign in to manage your creator profile.");
  const client = await clerkClient();
  const user = await client.users.getUser(ownerUserId);
  const name =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.primaryEmailAddress?.emailAddress.split("@")[0] ||
    "Creator";
  const preferredUsername = user.username?.trim() || name;
  const avatarUrl = user.imageUrl || "/brand/default-avatar.svg";

  const result = await withWriteTransaction(async (tx) => {
    await tx
      .insert(profileAccounts)
      .values({ userId: ownerUserId })
      .onConflictDoNothing({ target: profileAccounts.userId });
    const [account] = await tx
      .select({ status: profileAccounts.status })
      .from(profileAccounts)
      .where(eq(profileAccounts.userId, ownerUserId))
      .for("update");
    if (!account || account.status !== "active") {
      throw new Error("This account is not active.");
    }

    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.ownerUserId, ownerUserId))
      .limit(1);
    if (existing) return { profile: mapCreatorSummary(existing), created: false };

    const id = randomUUID();
    for (const username of creatorUsernameCandidates(preferredUsername)) {
      const [reservation] = await tx
        .select({ id: creatorUsernameAliases.id })
        .from(creatorUsernameAliases)
        .where(sql`lower(${creatorUsernameAliases.username}) = ${username}`)
        .limit(1);
      if (reservation) continue;

      try {
        // A savepoint rolls back the creator if a competing alias reservation wins.
        const created = await tx.transaction(async (candidateTx) => {
          const [creator] = await candidateTx
            .insert(creators)
            .values({ id, name, username, avatarUrl, ownerUserId, recordOrigin: "user" })
            .onConflictDoNothing()
            .returning();
          if (!creator) return null;
          const [alias] = await candidateTx
            .insert(creatorUsernameAliases)
            .values({ creatorId: id, username, isCurrent: true })
            .onConflictDoNothing()
            .returning({ id: creatorUsernameAliases.id });
          if (!alias) throw new UsernameReservationConflict();
          return creator;
        });
        if (created) return { profile: mapCreatorSummary(created), created: true };
      } catch (error) {
        if (!(error instanceof UsernameReservationConflict)) throw error;
      }
    }
    throw new Error("No available creator username could be generated.");
  });
  if (result.created) {
    // after runs outside render and only schedules invalidation after the commit.
    after(() => revalidateTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG, { expire: 0 }));
  }
  return result.profile;
}

export async function resolvePublicCreatorProfile(
  username: string,
): Promise<ResolvedCreatorProfile | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 21600, expire: 604800 });
  cacheTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG);

  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(normalized)) return null;

  const database = getDatabase();
  if (!database) return null;
  const alias = await database.query.creatorUsernameAliases.findFirst({
    columns: { username: true, isCurrent: true },
    where: eq(sql`lower(${creatorUsernameAliases.username})`, normalized),
    with: {
      creator: {
        columns: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          avatarStorageProvider: true,
          url: true,
          xProfileUrl: true,
        },
      },
    },
  });
  if (!alias?.creator?.username) return null;

  return {
    profile: mapPublicCreatorProfile(alias.creator),
    canonicalUsername: alias.creator.username,
    isAlias:
      !alias.isCurrent || alias.username.toLowerCase() !== alias.creator.username,
  };
}
