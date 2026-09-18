import "server-only";

import { randomUUID } from "node:crypto";

import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { requireDatabase } from "@/db/client";
import {
  adminAuditLogs,
  creatorClaims,
  creators,
  creatorUsernameAliases,
  logos,
  posts,
  profileAccounts,
  websites,
} from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import {
  isCreatorVisibleInEnvironment,
  shouldLockExistingCreator,
} from "@/features/admin/creator-environment-policy";
import { MEDIA_STORAGE_PROVIDERS } from "@/storage/types";
import type { ManagedMediaAsset } from "@/storage/types";

import type {
  AdminCreatorClaimRecord,
  AdminCreatorInput,
  AdminCreatorRecord,
  CreatorProfile,
  CreatorRecordOrigin,
} from "./types";
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

function mapCreatorProfile(row: CreatorRow): CreatorProfile {
  return {
    id: row.id,
    name: row.name,
    username:
      row.username ?? creatorUsernameCandidates(row.handle ?? row.name)[0] ?? "creator",
    avatarUrl: row.avatarUrl,
    websiteUrl: row.url,
    xProfileUrl: row.xProfileUrl,
  };
}

export function mapAdminCreator(
  row: CreatorRow,
  counts: { workCount?: number; pendingClaimCount?: number } = {},
): AdminCreatorRecord {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle ?? undefined,
    username: row.username ?? undefined,
    url: row.url ?? undefined,
    xProfileUrl: row.xProfileUrl ?? undefined,
    xProviderId: row.xProviderId ?? undefined,
    ownerUserId: row.ownerUserId ?? undefined,
    editedFields: row.editedFields as AdminCreatorRecord["editedFields"],
    recordOrigin: row.recordOrigin as CreatorRecordOrigin,
    avatarUrl: row.avatarUrl,
    avatarStorageProvider: isStorageProvider(row.avatarStorageProvider)
      ? (row.avatarStorageProvider as AdminCreatorRecord["avatarStorageProvider"])
      : undefined,
    avatarStorageKey: row.avatarStorageKey ?? undefined,
    workCount: counts.workCount ?? 0,
    pendingClaimCount: counts.pendingClaimCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
    handle: input.handle?.trim() || null,
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
    if (!isCreatorVisibleInEnvironment(input.handle, dataEnvironment)) {
      throw new Error("Development fixture creators can only be used in Development.");
    }
    const username = await availableUsername(
      database,
      input.username ?? input.handle ?? input.name,
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

export async function getAdminCreators() {
  const database = requireDatabase();
  const rows = await database.query.creators.findMany({
    orderBy: [asc(creators.name)],
  });
  const visibleRows = rows.filter((row) =>
    isCreatorVisibleInEnvironment(row.handle, process.env.DATA_ENVIRONMENT),
  );
  if (visibleRows.length === 0) return [];

  const ids = visibleRows.map((row) => row.id);
  const [postRows, logoRows, websiteRows, claimRows] = await Promise.all([
    database.select({ creatorId: posts.creatorId }).from(posts).where(inArray(posts.creatorId, ids)),
    database.select({ creatorId: logos.creatorId }).from(logos).where(inArray(logos.creatorId, ids)),
    database.select({ creatorId: websites.creatorId }).from(websites).where(inArray(websites.creatorId, ids)),
    database
      .select({ creatorId: creatorClaims.targetCreatorId })
      .from(creatorClaims)
      .where(
        and(
          inArray(creatorClaims.targetCreatorId, ids),
          eq(creatorClaims.status, "pending"),
        ),
      ),
  ]);

  const workCounts = new Map<string, number>();
  for (const { creatorId } of [...postRows, ...logoRows, ...websiteRows]) {
    workCounts.set(creatorId, (workCounts.get(creatorId) ?? 0) + 1);
  }
  const claimCounts = new Map<string, number>();
  for (const { creatorId } of claimRows) {
    claimCounts.set(creatorId, (claimCounts.get(creatorId) ?? 0) + 1);
  }

  return visibleRows.map((row) =>
    mapAdminCreator(row, {
      workCount: workCounts.get(row.id),
      pendingClaimCount: claimCounts.get(row.id),
    }),
  );
}

export async function getAdminCreatorClaims(): Promise<AdminCreatorClaimRecord[]> {
  const database = requireDatabase();
  const rows = await database.query.creatorClaims.findMany({
    orderBy: [asc(creatorClaims.createdAt)],
    with: { targetCreator: true },
  });
  return rows.map((row) => ({
    id: row.id,
    requesterUserId: row.requesterUserId,
    targetCreatorId: row.targetCreatorId,
    targetCreatorName: row.targetCreator.name,
    verifiedXUsername: row.verifiedXUsername,
    status: row.status as AdminCreatorClaimRecord["status"],
    reviewReason: row.reviewReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
  }));
}

export async function getCreatorProfile(id: string): Promise<CreatorProfile | null> {
  const database = requireDatabase();
  const row = await database.query.creators.findFirst({
    where: eq(creators.id, id),
  });
  return row ? mapCreatorProfile(row) : null;
}

export async function ensureOwnedCreator(userId: string): Promise<CreatorProfile> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const name =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.primaryEmailAddress?.emailAddress.split("@")[0] ||
    "Creator";
  const preferredUsername = user.username?.trim() || name;
  const avatarUrl = user.imageUrl || "/brand/default-avatar.svg";

  return withWriteTransaction(async (tx) => {
    await tx
      .insert(profileAccounts)
      .values({ userId })
      .onConflictDoNothing({ target: profileAccounts.userId });
    const [account] = await tx
      .select({ status: profileAccounts.status })
      .from(profileAccounts)
      .where(eq(profileAccounts.userId, userId))
      .for("update");
    if (!account || account.status !== "active") {
      throw new Error("This account is not active.");
    }

    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.ownerUserId, userId))
      .limit(1);
    if (existing) return mapCreatorProfile(existing);

    const username = await availableUsername(tx, preferredUsername);
    const id = randomUUID();
    const now = new Date();
    const [created] = await tx
      .insert(creators)
      .values({
        id,
        name,
        username,
        avatarUrl,
        ownerUserId: userId,
        recordOrigin: "user",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Creator profile could not be created.");
    await reserveCurrentUsername(tx, id, username);
    return mapCreatorProfile(created);
  });
}

export async function createAdminCreator(
  input: AdminCreatorInput,
  actorId: string,
) {
  return withWriteTransaction(async (tx) => {
    const id = randomUUID();
    const username = await availableUsername(
      tx,
      input.username ?? input.handle ?? input.name,
      { explicit: Boolean(input.username) },
    );
    const [created] = await tx
      .insert(creators)
      .values({
        id,
        ...creatorValues(input, username),
        recordOrigin: recordOriginForAdminCreate(),
      })
      .returning();
    if (!created) throw new Error("Creator could not be created.");
    await reserveCurrentUsername(tx, id, username);
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator.created",
      resourceType: "creator",
      resourceId: id,
      details: { username },
    });
    return mapAdminCreator(created);
  });
}

export async function updateAdminCreator(
  id: string,
  input: AdminCreatorInput,
  actorId: string,
) {
  return withWriteTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.id, id))
      .for("update");
    if (!existing) throw new Error("Creator not found.");
    if (shouldLockExistingCreator(existing, process.env.DATA_ENVIRONMENT)) {
      throw new Error("Mirrored creator profiles are read-only in Preview.");
    }
    const nextXProfileUrl = normalizedOptionalXProfileUrl(input.xProfileUrl) ?? null;
    if (
      (existing.ownerUserId || existing.xProviderId) &&
      existing.xProfileUrl !== nextXProfileUrl
    ) {
      throw new Error("A claimed creator's X association cannot be transferred.");
    }
    const username = await availableUsername(
      tx,
      input.username ?? existing.username ?? input.name,
      { explicit: Boolean(input.username), currentCreatorId: id },
    );
    const usernameChanged = username !== existing.username;
    const [updated] = await tx
      .update(creators)
      .set({ ...creatorValues(input, username), updatedAt: new Date() })
      .where(eq(creators.id, id))
      .returning();
    if (!updated) throw new Error("Creator not found.");
    if (usernameChanged) {
      await tx
        .update(creatorUsernameAliases)
        .set({ isCurrent: false })
        .where(
          and(
            eq(creatorUsernameAliases.creatorId, id),
            eq(creatorUsernameAliases.isCurrent, true),
          ),
        );
      await reserveCurrentUsername(tx, id, username);
    }
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator.updated",
      resourceType: "creator",
      resourceId: id,
      details: { username, previousUsername: existing.username },
    });
    return {
      creator: mapAdminCreator(updated),
      removedManagedMedia: managedCreatorAvatar(existing).filter(
        (asset) => asset.storageKey !== input.avatarStorageKey,
      ),
    };
  });
}

export async function deleteAdminCreator(id: string, actorId: string) {
  return withWriteTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.id, id))
      .for("update");
    if (!existing) throw new Error("Creator not found.");
    if (shouldLockExistingCreator(existing, process.env.DATA_ENVIRONMENT)) {
      throw new Error("Mirrored creator profiles cannot be deleted in Preview.");
    }
    if (existing.ownerUserId || existing.xProviderId) {
      throw new Error("Claimed creators cannot be deleted.");
    }
    const post = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.creatorId, id))
      .limit(1);
    const logo = await tx
      .select({ id: logos.id })
      .from(logos)
      .where(eq(logos.creatorId, id))
      .limit(1);
    const website = await tx
      .select({ id: websites.id })
      .from(websites)
      .where(eq(websites.creatorId, id))
      .limit(1);
    const claim = await tx
      .select({ id: creatorClaims.id })
      .from(creatorClaims)
      .where(eq(creatorClaims.targetCreatorId, id))
      .limit(1);
    if (post[0] || logo[0] || website[0]) {
      throw new Error("Reassign credited work before deleting this creator.");
    }
    if (claim[0]) throw new Error("Creators with claim history cannot be deleted.");

    await tx.delete(creators).where(eq(creators.id, id));
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator.deleted",
      resourceType: "creator",
      resourceId: id,
      details: { username: existing.username },
    });
    return { removedManagedMedia: managedCreatorAvatar(existing) };
  });
}
