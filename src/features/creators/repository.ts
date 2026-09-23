import "server-only";

import { ensureCreatorForOwner } from "./identity";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import {
  isCreatorVisibleInEnvironment,
  shouldLockExistingCreator,
} from "@/features/admin/creator-environment-policy";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";
import type { ManagedMediaAsset } from "@/storage/types";

import type { AdminCreatorInput, CreatorRecordOrigin } from "./types";
import {
  creatorUsernameCandidates,
  normalizeCreatorUsername,
  normalizeXProfileUrl,
  validateCreatorUsername,
} from "./validation";

type Database = ReturnType<typeof requireDatabase>;
type CreatorRow = typeof creators.$inferSelect;
type MutationDatabase = Database | WriteTx;

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function recordOriginForAdminCreate(): CreatorRecordOrigin {
  if (process.env.DATA_ENVIRONMENT === "preview") return "preview";
  if (process.env.DATA_ENVIRONMENT === "development") return "development";
  return "editorial";
}

function managedCreatorAvatar(creator: CreatorRow): ManagedMediaAsset[] {
  return isStorageProvider(creator.avatarStorageProvider) && creator.avatarStorageKey
    ? [
        {
          storageProvider:
            creator.avatarStorageProvider as ManagedMediaAsset["storageProvider"],
          storageKey: creator.avatarStorageKey,
          type: "image",
        },
      ]
    : [];
}

function normalizedOptionalXProfileUrl(value: string | undefined) {
  return value?.trim() ? normalizeXProfileUrl(value) : undefined;
}

function creatorValues(
  input: AdminCreatorInput,
  username: string | undefined,
) {
  return {
    name: input.name.trim(),
    handle: input.legacyHandle?.trim() || null,
    username: username ?? null,
    url: input.url?.trim() || null,
    xProfileUrl: normalizedOptionalXProfileUrl(input.xProfileUrl) ?? null,
    avatarUrl: input.avatarUrl,
    avatarStorageProvider: input.avatarStorageProvider ?? null,
    avatarStorageKey: input.avatarStorageKey ?? null,
  };
}

async function availableUsername(
  database: MutationDatabase,
  preferred: string,
  options: { explicit?: boolean; currentCreatorId?: string } = {},
) {
  const normalized = normalizeCreatorUsername(preferred);
  const validation = validateCreatorUsername(normalized);
  if (!validation.ok && options.explicit) throw new Error(validation.message);

  const candidates = options.explicit
    ? [normalized]
    : creatorUsernameCandidates(preferred);
  for (const candidate of candidates) {
    const [reservation] = await database
      .select({ creatorId: creatorUsernameAliases.creatorId })
      .from(creatorUsernameAliases)
      .where(sql`lower(${creatorUsernameAliases.username}) = ${candidate}`)
      .limit(1);
    if (!reservation || reservation.creatorId === options.currentCreatorId) {
      return candidate;
    }
  }
  throw new Error("No available creator username could be generated.");
}

function reserveCurrentUsername(
  database: MutationDatabase,
  creatorId: string,
  username: string,
) {
  return database.insert(creatorUsernameAliases).values({
    creatorId,
    username,
    isCurrent: true,
  });
}

export async function resolveCreatorMutation(
  database: Database,
  input: AdminCreatorInput,
) {
  const dataEnvironment = process.env.DATA_ENVIRONMENT;

  if (!input.id) {
    const id = randomUUID();
    if (!isCreatorVisibleInEnvironment(input.legacyHandle, dataEnvironment)) {
      throw new Error("Development fixture creators can only be used in Development.");
    }
    const username = await availableUsername(
      database,
      input.username ?? input.legacyHandle ?? input.name,
      { explicit: Boolean(input.username) },
    );
    return {
      id,
      mutations: [
        database.insert(creators).values({
          id,
          ...creatorValues(input, username),
          recordOrigin: recordOriginForAdminCreate(),
        }),
        reserveCurrentUsername(database, id, username),
      ] as [BatchItem<"pg">, ...BatchItem<"pg">[]],
      removedManagedMedia: [] as ManagedMediaAsset[],
    };
  }

  const existing = await database.query.creators.findFirst({
    where: eq(creators.id, input.id),
  });
  if (!existing) throw new Error("Creator not found.");
  if (!isCreatorVisibleInEnvironment(existing.handle, dataEnvironment)) {
    throw new Error("Creator not found.");
  }

  const locked = shouldLockExistingCreator(existing, dataEnvironment);
  if (locked) {
    return {
      id: existing.id,
      mutations: [
        database
          .update(creators)
          .set({ updatedAt: new Date() })
          .where(eq(creators.id, existing.id)),
      ] as [BatchItem<"pg">, ...BatchItem<"pg">[]],
      removedManagedMedia: [] as ManagedMediaAsset[],
    };
  }

  const nextXProfileUrl = normalizedOptionalXProfileUrl(input.xProfileUrl) ?? null;
  if (
    (existing.ownerUserId || existing.xProviderId) &&
    existing.xProfileUrl !== nextXProfileUrl
  ) {
    throw new Error("A claimed creator's X association cannot be transferred.");
  }

  const nextUsername = input.username
    ? await availableUsername(database, input.username, {
        explicit: true,
        currentCreatorId: existing.id,
      })
    : (existing.username ?? undefined);
  const usernameChanged = Boolean(
    nextUsername && nextUsername !== existing.username,
  );
  const removedManagedMedia = managedCreatorAvatar(existing).filter(
    (asset) => asset.storageKey !== input.avatarStorageKey,
  );
  const mutations: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    database
      .update(creators)
      .set({ ...creatorValues(input, nextUsername), updatedAt: new Date() })
      .where(eq(creators.id, existing.id)),
  ];

  if (usernameChanged && nextUsername) {
    mutations.push(
      database
        .update(creatorUsernameAliases)
        .set({ isCurrent: false })
        .where(
          and(
            eq(creatorUsernameAliases.creatorId, existing.id),
            eq(creatorUsernameAliases.isCurrent, true),
          ),
        ),
      reserveCurrentUsername(database, existing.id, nextUsername),
    );
  }

  return { id: existing.id, mutations, removedManagedMedia };
}

// Compatibility for the claim workflow until its own ticket migrates that caller.
export async function ensureOwnedCreator(userId: string) {
  return ensureCreatorForOwner({ userId });
}
