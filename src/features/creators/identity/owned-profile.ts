import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { creators, creatorUsernameAliases, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import type { CreatorEditedField } from "../types";
import type { ProfileEditInput } from "@/features/profiles/types";
import type { CreatorOwnerPrincipal } from "./index";
import { profileEditSchema } from "@/features/profiles/validation";
import { getR2PublicUrl, isStorageKeyForKind } from "@/storage/r2";
import type { ManagedMediaAsset } from "@/storage/types";
import { mapCreatorSummary } from "./projections";

function mapOwnedCreatorSummary(row: typeof creators.$inferSelect) {
  // Preserve the existing owner-mutation guard without promising alias-backed lookup.
  if (!row.username) throw new Error("Creator profile has no public username.");
  return mapCreatorSummary(row);
}

type ProfileMutationCode = "invalid_input" | "unavailable_username" | "missing_creator" | "inactive_account" | "ownership_conflict" | "database_unavailable";

export class ProfileMutationError extends Error {
  constructor(
    readonly field: "name" | "username" | "websiteUrl" | "form",
    message: string,
    readonly code: ProfileMutationCode = "invalid_input",
  ) {
    super(message);
    this.name = "ProfileMutationError";
  }
}

function ownerUserId(principal: CreatorOwnerPrincipal) {
  if (!principal?.userId?.trim()) {
    throw new ProfileMutationError("form", "Sign in to edit your profile.", "ownership_conflict");
  }
  return principal.userId;
}

async function lockOwnedCreator(
  tx: Parameters<Parameters<typeof withWriteTransaction>[0]>[0],
  userId: string,
) {
  // Match claim approval: account first, then creators in deterministic ID order.
  const [account] = await tx.select({ status: profileAccounts.status })
    .from(profileAccounts).where(eq(profileAccounts.userId, userId)).for("update");
  if (!account || account.status !== "active") {
    throw new ProfileMutationError("form", "This account is not active.", "inactive_account");
  }
  const [snapshot] = await tx.select({ id: creators.id }).from(creators)
    .where(eq(creators.ownerUserId, userId)).limit(1);
  if (!snapshot) {
    throw new ProfileMutationError("form", "Your creator profile was not found.", "missing_creator");
  }
  const [creator] = await tx.select().from(creators).where(eq(creators.id, snapshot.id))
    .orderBy(asc(creators.id)).for("update");
  if (!creator || creator.ownerUserId !== userId) {
    throw new ProfileMutationError("form", "Your creator ownership changed. Reload and try again.", "ownership_conflict");
  }
  return creator;
}

async function writeOwnedProfile<T>(work: Parameters<typeof withWriteTransaction<T>>[0]): Promise<T> {
  try {
    return await withWriteTransaction(work);
  } catch (error) {
    if (error instanceof ProfileMutationError) throw error;
    // Drizzle wraps PostgreSQL errors in cause. Translate only after rollback.
    let cause: unknown = error;
    while (cause && typeof cause === "object") {
      const databaseError = cause as { code?: string; constraint?: string; cause?: unknown };
      if (databaseError.code === "23505" && ["creators_username_lower_unique", "creator_username_aliases_lower_unique"].includes(databaseError.constraint ?? "")) {
        throw new ProfileMutationError("username", "That username is unavailable.", "unavailable_username");
      }
      if (["23505", "40001", "40P01"].includes(databaseError.code ?? "")) {
        throw new ProfileMutationError("form", "Your profile changed during this save. Reload and try again.", "ownership_conflict");
      }
      cause = databaseError.cause;
    }
    throw new ProfileMutationError("form", "Your profile could not be saved because the database is unavailable. Try again.", "database_unavailable");
  }
}

export async function updateOwnedCreatorProfile(
  principal: CreatorOwnerPrincipal,
  input: ProfileEditInput,
) {
  const userId = ownerUserId(principal);
  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    throw new ProfileMutationError(field === "name" || field === "username" || field === "websiteUrl" ? field : "form", issue?.message ?? "Check your profile details.");
  }
  input = parsed.data;
  return writeOwnedProfile(async (tx) => {
    const creator = await lockOwnedCreator(tx, userId);
    const nextUsername = input.username ?? creator.username;
    if (!nextUsername) {
      throw new ProfileMutationError("username", "Choose a username.");
    }
    if (nextUsername !== creator.username) {
      const [reservation] = await tx
        .select({ creatorId: creatorUsernameAliases.creatorId })
        .from(creatorUsernameAliases)
        .where(eq(sql`lower(${creatorUsernameAliases.username})`, nextUsername))
        .limit(1);
      if (reservation && reservation.creatorId !== creator.id) {
        throw new ProfileMutationError("username", "That username is unavailable.", "unavailable_username");
      }
    }

    const editedFields = new Set(
      creator.editedFields as CreatorEditedField[],
    );
    if (input.name !== undefined) editedFields.add("name");
    if (input.username !== undefined) editedFields.add("username");
    if (input.websiteUrl !== undefined) editedFields.add("websiteUrl");
    const [updated] = await tx
      .update(creators)
      .set({
        name: input.name ?? creator.name,
        username: nextUsername,
        url:
          input.websiteUrl === undefined ? creator.url : input.websiteUrl,
        editedFields: [...editedFields],
        updatedAt: new Date(),
      })
      .where(and(eq(creators.id, creator.id), eq(creators.ownerUserId, userId)))
      .returning();
    if (!updated) throw new ProfileMutationError("form", "Your profile could not be saved.", "ownership_conflict");

    if (nextUsername !== creator.username) {
      await tx
        .update(creatorUsernameAliases)
        .set({ isCurrent: false })
        .where(
          and(
            eq(creatorUsernameAliases.creatorId, creator.id),
            eq(creatorUsernameAliases.isCurrent, true),
          ),
        );
      const [reactivated] = await tx
        .update(creatorUsernameAliases)
        .set({ isCurrent: true })
        .where(and(
          eq(creatorUsernameAliases.creatorId, creator.id),
          eq(sql`lower(${creatorUsernameAliases.username})`, nextUsername),
        ))
        .returning({ id: creatorUsernameAliases.id });
      if (!reactivated) {
        await tx.insert(creatorUsernameAliases).values({
          creatorId: creator.id,
          username: nextUsername,
          isCurrent: true,
        });
      }
    }
    return mapOwnedCreatorSummary(updated);
  });
}

export async function updateOwnedCreatorAvatar(
  principal: CreatorOwnerPrincipal,
  avatar: { url: string; storageKey: string },
) {
  const userId = ownerUserId(principal);
  if (!avatar || typeof avatar.storageKey !== "string" || !isStorageKeyForKind(avatar.storageKey, "creator-avatar") || !avatar.storageKey.endsWith(".webp") || avatar.url !== getR2PublicUrl(avatar.storageKey)) {
    throw new ProfileMutationError("form", "The uploaded photo details are invalid.");
  }
  return writeOwnedProfile(async (tx) => {
    const creator = await lockOwnedCreator(tx, userId);
    const editedFields = new Set(
      creator.editedFields as CreatorEditedField[],
    );
    editedFields.add("avatarUrl");
    const [updated] = await tx
      .update(creators)
      .set({
        avatarUrl: avatar.url,
        avatarStorageProvider: "r2",
        avatarStorageKey: avatar.storageKey,
        editedFields: [...editedFields],
        updatedAt: new Date(),
      })
      .where(and(eq(creators.id, creator.id), eq(creators.ownerUserId, userId)))
      .returning();
    if (!updated) throw new ProfileMutationError("form", "Your photo could not be saved.", "ownership_conflict");
    return {
      profile: mapOwnedCreatorSummary(updated),
      displacedAvatarAssets: (
        creator.avatarStorageProvider === "r2" && creator.avatarStorageKey && creator.avatarStorageKey !== avatar.storageKey
          ? [{ storageProvider: "r2", storageKey: creator.avatarStorageKey, type: "image" }]
          : []
      ) as ManagedMediaAsset[],
    };
  });
}
