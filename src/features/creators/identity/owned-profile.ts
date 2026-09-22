import "server-only";

// Existing owner mutations remain compatibility implementations until their policy migration.
import { and, eq, sql } from "drizzle-orm";
import { creators, creatorUsernameAliases, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import type { CreatorEditedField } from "../types";
import type { ProfileEditInput } from "@/features/profiles/types";
import { mapCreatorSummary } from "./projections";

function mapOwnedCreatorSummary(row: typeof creators.$inferSelect) {
  // Preserve the existing owner-mutation guard without promising alias-backed lookup.
  if (!row.username) throw new Error("Creator profile has no public username.");
  return mapCreatorSummary(row);
}

export class ProfileMutationError extends Error {
  constructor(
    readonly field: "name" | "username" | "websiteUrl" | "form",
    message: string,
  ) {
    super(message);
    this.name = "ProfileMutationError";
  }
}

async function lockOwnedCreator(
  tx: Parameters<Parameters<typeof withWriteTransaction>[0]>[0],
  userId: string,
) {
  const [account] = await tx
    .select({ status: profileAccounts.status })
    .from(profileAccounts)
    .where(eq(profileAccounts.userId, userId))
    .for("update");
  if (!account || account.status !== "active") {
    throw new ProfileMutationError("form", "This account is not active.");
  }
  const [creator] = await tx
    .select()
    .from(creators)
    .where(eq(creators.ownerUserId, userId))
    .for("update");
  if (!creator) {
    throw new ProfileMutationError("form", "Your creator profile was not found.");
  }
  return creator;
}

export async function updateOwnedCreatorProfile(
  userId: string,
  input: ProfileEditInput,
) {
  return withWriteTransaction(async (tx) => {
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
        throw new ProfileMutationError("username", "That username is unavailable.");
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
    if (!updated) throw new ProfileMutationError("form", "Your profile could not be saved.");

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
      await tx.insert(creatorUsernameAliases).values({
        creatorId: creator.id,
        username: nextUsername,
        isCurrent: true,
      });
    }
    return mapOwnedCreatorSummary(updated);
  });
}

export async function updateOwnedCreatorAvatar(
  userId: string,
  avatar: { url: string; storageKey: string },
) {
  return withWriteTransaction(async (tx) => {
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
    if (!updated) throw new ProfileMutationError("form", "Your photo could not be saved.");
    return {
      profile: mapOwnedCreatorSummary(updated),
      previousAsset:
        creator.avatarStorageProvider === "r2" && creator.avatarStorageKey
          ? {
              storageProvider: "r2" as const,
              storageKey: creator.avatarStorageKey,
              type: "image" as const,
            }
          : null,
    };
  });
}
