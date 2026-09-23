import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/auth/require-admin";
import { requireDatabase } from "@/db/client";
import {
  adminAuditLogs,
  creatorClaims,
  creators,
  creatorUsernameAliases,
  logos,
  posts,
  submissions,
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
  AdminCreatorMutationCode,
  CreatorRecordOrigin,
} from "../types";
import {
  creatorUsernameCandidates,
  normalizeCreatorUsername,
  normalizeXProfileUrl,
  validateAdminCreatorInput,
  validateCreatorUsername,
} from "../validation";
import {
  mapAdminCreatorAttribution,
  mapAdminCreatorRecord,
} from "./projections";

import {
  setCurrentUsernameAlias,
} from "./username-aliases";

type CreatorRow = typeof creators.$inferSelect;
type MutationDatabase = WriteTx;

/** Established by a server authentication adapter, never by request body fields. */
export type AdminPrincipal = Readonly<{ userId: string }>;

export class AdminCreatorMutationError extends Error {
  constructor(
    readonly code: AdminCreatorMutationCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminCreatorMutationError";
  }
}

function isStorageProvider(value: string | null) {
  return MEDIA_STORAGE_PROVIDERS.some((provider) => provider === value);
}

function recordOriginForAdminCreate(): CreatorRecordOrigin {
  if (process.env.DATA_ENVIRONMENT === "preview") return "preview";
  if (process.env.DATA_ENVIRONMENT === "development") return "development";
  return "editorial";
}

function managedCreatorAvatar(creator: CreatorRow): ManagedMediaAsset[] {
  return isStorageProvider(creator.avatarStorageProvider) &&
    creator.avatarStorageKey
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

function validatedCreatorInput(input: AdminCreatorInput) {
  try {
    return validateAdminCreatorInput(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AdminCreatorMutationError(
        "invalid_input",
        error.issues[0]?.message ?? "Check the creator details.",
      );
    }
    throw error;
  }
}

function creatorValues(input: AdminCreatorInput, username: string | null) {
  return {
    name: input.name.trim(),
    handle: input.legacyHandle?.trim() || null,
    username,
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
  if (!validation.ok && options.explicit) {
    throw new AdminCreatorMutationError("invalid_input", validation.message);
  }

  const candidates = options.explicit
    ? [normalized]
    : creatorUsernameCandidates(preferred);
  for (const candidate of candidates) {
    const [reservation] = await database
      .select({ creatorId: creatorUsernameAliases.creatorId })
      .from(creatorUsernameAliases)
      .where(eq(sql`lower(${creatorUsernameAliases.username})`, candidate))
      .limit(1);
    const [currentCreator] = await database
      .select({ id: creators.id })
      .from(creators)
      .where(eq(sql`lower(${creators.username})`, candidate))
      .limit(1);
    if (
      (!reservation || reservation.creatorId === options.currentCreatorId) &&
      (!currentCreator || currentCreator.id === options.currentCreatorId)
    ) {
      return candidate;
    }
  }
  throw new AdminCreatorMutationError(
    "conflict",
    options.explicit
      ? "That username is unavailable."
      : "No available creator username could be generated.",
  );
}

function databaseError(error: unknown) {
  let cause: unknown = error;
  while (cause && typeof cause === "object") {
    const candidate = cause as {
      code?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (
      candidate.code === "23505" &&
      [
        "creators_username_lower_unique",
        "creator_username_aliases_lower_unique",
      ].includes(candidate.constraint ?? "")
    ) {
      return new AdminCreatorMutationError(
        "conflict",
        "That username is unavailable.",
      );
    }
    if (candidate.code === "23503") {
      return new AdminCreatorMutationError(
        "conflict",
        "This creator is still referenced and cannot be deleted.",
      );
    }
    if (["23505", "40001", "40P01"].includes(candidate.code ?? "")) {
      return new AdminCreatorMutationError(
        "conflict",
        "The creator changed during this save. Reload and try again.",
      );
    }
    cause = candidate.cause;
  }
  return new AdminCreatorMutationError(
    "database_unavailable",
    "The creator could not be saved because the database is unavailable. Try again.",
  );
}

async function writeAdminCreator<T>(
  work: Parameters<typeof withWriteTransaction<T>>[0],
) {
  try {
    return await withWriteTransaction(work);
  } catch (error) {
    if (error instanceof AdminCreatorMutationError) throw error;
    throw databaseError(error);
  }
}

async function newAdminCreatorValues(
  database: MutationDatabase,
  input: AdminCreatorInput,
) {
  const creatorId = randomUUID();
  const username = await availableUsername(
    database,
    input.username ?? input.legacyHandle ?? input.name,
    { explicit: Boolean(input.username) },
  );
  return {
    id: creatorId,
    ...creatorValues(input, username),
    username,
    recordOrigin: recordOriginForAdminCreate(),
  };
}

async function createAdminCreatorRecord(
  transaction: WriteTx,
  input: AdminCreatorInput,
) {
  const values = await newAdminCreatorValues(transaction, input);
  const { id: creatorId, username } = values;
  const [created] = await transaction
    .insert(creators)
    .values(values)
    .returning();
  if (!created) {
    throw new AdminCreatorMutationError(
      "database_unavailable",
      "Creator could not be created.",
    );
  }
  await transaction.insert(creatorUsernameAliases).values({
    creatorId,
    username,
    isCurrent: true,
  });
  return { created, username };
}

async function adminCreatorUpdateValues(
  database: MutationDatabase,
  existing: CreatorRow,
  input: AdminCreatorInput,
  options: { generateUsernameWhenMissing: boolean },
) {
  const nextXProfileUrl =
    normalizedOptionalXProfileUrl(input.xProfileUrl) ?? null;
  if (
    (existing.ownerUserId || existing.xProviderId) &&
    existing.xProfileUrl !== nextXProfileUrl
  ) {
    throw new AdminCreatorMutationError(
      "conflict",
      "An owned or provider-associated creator's X association cannot be transferred.",
    );
  }

  const username = input.username
    ? await availableUsername(database, input.username, {
        explicit: true,
        currentCreatorId: existing.id,
      })
    : options.generateUsernameWhenMissing
      ? await availableUsername(
          database,
          existing.username ?? input.name,
          { currentCreatorId: existing.id },
        )
      : existing.username;
  const values = {
    ...creatorValues(input, username),
    // The form can clear metadata while editing and then restore the same URL.
    ...(input.avatarUrl === existing.avatarUrl
      ? {
          avatarStorageProvider: existing.avatarStorageProvider,
          avatarStorageKey: existing.avatarStorageKey,
        }
      : {}),
  };
  return { values, username };
}

async function updateAdminCreatorRecord(
  transaction: WriteTx,
  existing: CreatorRow,
  input: AdminCreatorInput,
  options: { generateUsernameWhenMissing: boolean },
) {
  const { values, username } = await adminCreatorUpdateValues(
    transaction, existing, input, options,
  );
  const [updated] = await transaction
    .update(creators)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(creators.id, existing.id))
    .returning();
  if (!updated) {
    throw new AdminCreatorMutationError("missing_creator", "Creator not found.");
  }
  if (username && username !== existing.username) {
    await setCurrentUsernameAlias(transaction, existing.id, username);
  }
  return {
    updated,
    username,
    displacedAvatarAssets: displacedAvatarAssets(
      existing, updated.avatarStorageKey,
    ),
  };
}

function assertAttributionCreatorVisible(
  existing: CreatorRow | undefined,
): asserts existing is CreatorRow {
  if (
    !existing ||
    !isCreatorVisibleInEnvironment(existing.handle, process.env.DATA_ENVIRONMENT)
  ) {
    throw new AdminCreatorMutationError("missing_creator", "Creator not found.");
  }
}

function assertNewAttributionCreatorVisible(input: AdminCreatorInput) {
  if (
    !isCreatorVisibleInEnvironment(input.legacyHandle, process.env.DATA_ENVIRONMENT)
  ) {
    throw new AdminCreatorMutationError(
      "environment_restricted",
      "Development fixture creators can only be used in Development.",
    );
  }
}

function displacedAvatarAssets(
  existing: CreatorRow,
  avatarStorageKey: string | null,
) {
  return managedCreatorAvatar(existing).filter(
    (asset) => asset.storageKey !== avatarStorageKey,
  );
}

export async function saveAdminCreatorForAttribution(
  transaction: WriteTx,
  adminPrincipal: AdminPrincipal,
  creatorInput: AdminCreatorInput,
) {
  if (!adminPrincipal.userId?.trim()) {
    throw new AdminCreatorMutationError(
      "invalid_input",
      "Trusted administrator authority is required.",
    );
  }

  const input = validatedCreatorInput(creatorInput);
  const dataEnvironment = process.env.DATA_ENVIRONMENT;

  if (!input.id) {
    assertNewAttributionCreatorVisible(input);
    const { created } = await createAdminCreatorRecord(transaction, input);
    return {
      creatorId: created.id,
      displacedAvatarAssets: [] as ManagedMediaAsset[],
    };
  }

  const [existing] = await transaction
    .select()
    .from(creators)
    .where(eq(creators.id, input.id))
    .for("update");
  assertAttributionCreatorVisible(existing);

  if (shouldLockExistingCreator(existing, dataEnvironment)) {
    await transaction
      .update(creators)
      .set({ updatedAt: new Date() })
      .where(eq(creators.id, existing.id));
    return {
      creatorId: existing.id,
      displacedAvatarAssets: [] as ManagedMediaAsset[],
    };
  }

  const result = await updateAdminCreatorRecord(
    transaction,
    existing,
    input,
    { generateUsernameWhenMissing: false },
  );
  return {
    creatorId: existing.id,
    displacedAvatarAssets: result.displacedAvatarAssets,
  };
}

export async function getAdminCreators() {
  await requireAdmin();
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
    database
      .select({ creatorId: posts.creatorId })
      .from(posts)
      .where(inArray(posts.creatorId, ids)),
    database
      .select({ creatorId: logos.creatorId })
      .from(logos)
      .where(inArray(logos.creatorId, ids)),
    database
      .select({ creatorId: websites.creatorId })
      .from(websites)
      .where(inArray(websites.creatorId, ids)),
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
    mapAdminCreatorRecord(row, {
      workCount: workCounts.get(row.id) ?? 0,
      pendingClaimCount: claimCounts.get(row.id) ?? 0,
    }),
  );
}

export async function getAdminCreatorClaims(): Promise<
  AdminCreatorClaimRecord[]
> {
  await requireAdmin();
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

export async function createAdminCreator(input: AdminCreatorInput) {
  const { userId: actorId } = await requireAdmin();
  input = validatedCreatorInput(input);
  return writeAdminCreator(async (tx) => {
    const { created, username } = await createAdminCreatorRecord(tx, input);
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator.created",
      resourceType: "creator",
      resourceId: created.id,
      details: { username },
    });
    return mapAdminCreatorAttribution(created);
  });
}

export async function updateAdminCreator(
  id: string,
  input: AdminCreatorInput,
) {
  const { userId: actorId } = await requireAdmin();
  input = validatedCreatorInput(input);
  return writeAdminCreator(async (tx) => {
    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.id, id))
      .for("update");
    if (!existing) {
      throw new AdminCreatorMutationError(
        "missing_creator",
        "Creator not found.",
      );
    }
    if (shouldLockExistingCreator(existing, process.env.DATA_ENVIRONMENT)) {
      throw new AdminCreatorMutationError(
        "environment_restricted",
        "Mirrored creator profiles are read-only in Preview.",
      );
    }

    const result = await updateAdminCreatorRecord(tx, existing, input, {
      generateUsernameWhenMissing: true,
    });
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator.updated",
      resourceType: "creator",
      resourceId: id,
      details: {
        username: result.username,
        previousUsername: existing.username,
      },
    });
    return {
      creator: mapAdminCreatorAttribution(result.updated),
      removedManagedMedia: result.displacedAvatarAssets,
    };
  });
}

export async function deleteAdminCreator(id: string) {
  const { userId: actorId } = await requireAdmin();
  return writeAdminCreator(async (tx) => {
    const [existing] = await tx
      .select()
      .from(creators)
      .where(eq(creators.id, id))
      .for("update");
    if (!existing) {
      throw new AdminCreatorMutationError(
        "missing_creator",
        "Creator not found.",
      );
    }
    if (shouldLockExistingCreator(existing, process.env.DATA_ENVIRONMENT)) {
      throw new AdminCreatorMutationError(
        "environment_restricted",
        "Mirrored creator records cannot be deleted in Preview.",
      );
    }
    if (existing.ownerUserId || existing.xProviderId) {
      throw new AdminCreatorMutationError(
        "conflict",
        "Owned or provider-associated creators cannot be deleted.",
      );
    }

    const [post] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.creatorId, id))
      .limit(1);
    const [logo] = await tx
      .select({ id: logos.id })
      .from(logos)
      .where(eq(logos.creatorId, id))
      .limit(1);
    const [website] = await tx
      .select({ id: websites.id })
      .from(websites)
      .where(eq(websites.creatorId, id))
      .limit(1);
    const [claim] = await tx
      .select({ id: creatorClaims.id })
      .from(creatorClaims)
      .where(eq(creatorClaims.targetCreatorId, id))
      .limit(1);
    const [submission] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.creatorId, id))
      .limit(1);
    if (post || logo || website) {
      throw new AdminCreatorMutationError(
        "conflict",
        "Reassign credited work before deleting this creator.",
      );
    }
    if (claim) {
      throw new AdminCreatorMutationError(
        "conflict",
        "Creators with claim history cannot be deleted.",
      );
    }
    if (submission) {
      throw new AdminCreatorMutationError(
        "conflict",
        "Creators referenced by submissions cannot be deleted.",
      );
    }

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
