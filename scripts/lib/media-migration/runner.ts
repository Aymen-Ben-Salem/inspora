import type { ExecutionOptions, ProductionMediaEnvironment } from "../production-environment";
import { prepareCreatorAvatarMigration, preparePostMediaMigration } from "./processors";
import { MigrationRepository } from "./repository";
import { MigrationStorage } from "./storage";
import type { MigrationAudit, SourceSnapshot, TargetSnapshot } from "./types";
import { targetStorageKeys } from "./types";

const CONCURRENCY = 2;

async function mapConcurrent<T>(
  values: T[],
  operation: (value: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        const value = values[index];
        if (value !== undefined) await operation(value, index);
      }
    },
  );
  await Promise.all(workers);
}

function sourceLabel(source: SourceSnapshot) {
  return `${source.kind}:${source.id}`;
}

function cloudinaryResourceType(source: SourceSnapshot) {
  return source.kind === "creator_avatar" || source.type === "image"
    ? "image"
    : "video";
}

function sourceStorageKey(source: SourceSnapshot) {
  return source.kind === "creator_avatar"
    ? source.avatarStorageKey
    : source.storageKey;
}

function targetMatches(current: TargetSnapshot | null, expected: TargetSnapshot) {
  if (!current || current.kind !== expected.kind || current.id !== expected.id) return false;
  if (current.kind === "creator_avatar" && expected.kind === "creator_avatar") {
    return (
      current.avatarStorageProvider === "r2" &&
      current.avatarStorageKey === expected.avatarStorageKey &&
      current.avatarUrl === expected.avatarUrl
    );
  }
  if (current.kind !== "post_media" || expected.kind !== "post_media") return false;
  return (
    current.storageProvider === "r2" &&
    current.storageKey === expected.storageKey &&
    current.url === expected.url &&
    current.posterUrl === expected.posterUrl &&
    current.posterStorageKey === expected.posterStorageKey &&
    current.mimeType === expected.mimeType &&
    current.sourceMimeType === expected.sourceMimeType &&
    current.sizeBytes === expected.sizeBytes &&
    current.width === expected.width &&
    current.height === expected.height &&
    JSON.stringify(current.variants) === JSON.stringify(expected.variants)
  );
}

async function verifyAudit(
  audit: MigrationAudit,
  repository: MigrationRepository,
  storage: MigrationStorage,
) {
  if (!audit.targetSnapshot) throw new Error("Audit has no target snapshot.");
  const current = await repository.getCurrentSnapshot(audit);
  if (!targetMatches(current, audit.targetSnapshot)) {
    throw new Error("Database row does not match its target snapshot.");
  }
  for (const key of targetStorageKeys(audit.targetSnapshot)) {
    await storage.verifyObject(key);
  }
}

export async function migrateCloudinaryToR2(
  environment: ProductionMediaEnvironment,
  options: ExecutionOptions,
) {
  const repository = new MigrationRepository(environment);
  const storage = new MigrationStorage(environment);
  const allSources = await repository.listCloudinarySources();
  const sources = options.limit ? allSources.slice(0, options.limit) : allSources;

  console.log(
    `${options.execute ? "Executing" : "Dry run:"} ${sources.length} of ${allSources.length} Cloudinary resource(s) selected.`,
  );
  for (const source of sources) {
    console.log(`- ${sourceLabel(source)} (${sourceStorageKey(source)})`);
  }
  if (!options.execute || sources.length === 0) return;

  const failures: Error[] = [];
  await mapConcurrent(sources, async (source, index) => {
    const label = sourceLabel(source);
    try {
      const publicId = sourceStorageKey(source);
      if (!publicId) throw new Error("Cloudinary storage key is missing.");
      console.log(`[${index + 1}/${sources.length}] Downloading ${label}`);
      const cloudinary = await storage.resolveCloudinarySource(
        publicId,
        cloudinaryResourceType(source),
      );
      const body = await storage.download(cloudinary);
      const prepared =
        source.kind === "creator_avatar"
          ? await prepareCreatorAvatarMigration({
              source,
              cloudinary,
              body,
              storage,
            })
          : await preparePostMediaMigration({
              source,
              cloudinary,
              body,
              storage,
            });
      console.log(`[${index + 1}/${sources.length}] Uploading ${label}`);
      await storage.uploadAndVerify(prepared.objects);
      await repository.recordMigration(source, prepared.target);
      console.log(`[${index + 1}/${sources.length}] Migrated ${label}`);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      failures.push(new Error(`${label}: ${error.message}`));
      await repository.recordFailure(source, error.message).catch(() => undefined);
      console.error(`[${index + 1}/${sources.length}] Failed ${label}: ${error.message}`);
    }
  });

  if (failures.length) {
    throw new AggregateError(failures, `${failures.length} migration(s) failed.`);
  }
}

export async function verifyR2Migration(
  environment: ProductionMediaEnvironment,
  options: { allowRemaining?: boolean } = {},
) {
  const repository = new MigrationRepository(environment);
  const storage = new MigrationStorage(environment);
  const audits = await repository.listAudits(["migrated", "source_deleted"]);
  const failures: Error[] = [];

  await mapConcurrent(audits, async (audit, index) => {
    try {
      await verifyAudit(audit, repository, storage);
      console.log(`[${index + 1}/${audits.length}] Verified ${audit.resourceType}:${audit.resourceId}`);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      failures.push(new Error(`${audit.resourceType}:${audit.resourceId}: ${error.message}`));
      console.error(`[${index + 1}/${audits.length}] Failed: ${error.message}`);
    }
  });

  const remaining = await repository.listCloudinarySources();
  console.log(`Verified audits: ${audits.length}; Cloudinary rows remaining: ${remaining.length}.`);
  if (remaining.length && !options.allowRemaining) {
    failures.push(new Error(`${remaining.length} managed Cloudinary row(s) remain.`));
  }
  if (failures.length) throw new AggregateError(failures, "R2 verification failed.");
}

export async function rollbackR2Migration(
  environment: ProductionMediaEnvironment,
  options: ExecutionOptions,
) {
  const repository = new MigrationRepository(environment);
  const storage = new MigrationStorage(environment);
  const allAudits = await repository.listAudits(["migrated"]);
  const audits = options.limit ? allAudits.slice(0, options.limit) : allAudits;
  console.log(
    `${options.execute ? "Executing" : "Dry run:"} ${audits.length} migration rollback(s).`,
  );
  for (const audit of audits) console.log(`- ${audit.resourceType}:${audit.resourceId}`);
  if (!options.execute) return;

  for (const audit of audits) {
    if (!audit.targetSnapshot) throw new Error(`Audit ${audit.id} has no target.`);
    await repository.restoreSource(audit);
    await storage.deleteR2Objects(targetStorageKeys(audit.targetSnapshot));
    console.log(`Rolled back ${audit.resourceType}:${audit.resourceId}`);
  }
}

export async function cleanupCloudinary(
  environment: ProductionMediaEnvironment,
  options: ExecutionOptions,
) {
  const repository = new MigrationRepository(environment);
  const storage = new MigrationStorage(environment);
  const allAudits = await repository.listAudits(["migrated"]);
  const audits = options.limit ? allAudits.slice(0, options.limit) : allAudits;
  const references = await repository.referencedCloudinaryKeys();
  const deleted = new Set<string>();

  console.log(
    `${options.execute ? "Executing" : "Dry run:"} Cloudinary cleanup for ${audits.length} verified migration(s).`,
  );
  for (const audit of audits) {
    const source = audit.sourceSnapshot;
    const key = sourceStorageKey(source);
    if (!key) continue;
    const resourceType = cloudinaryResourceType(source);
    const identity = `${resourceType}:${key}`;
    if (references.has(identity)) {
      console.log(`- keeping ${identity}; it is still referenced`);
      continue;
    }
    console.log(`- ${identity}`);
    if (!options.execute) continue;
    await verifyAudit(audit, repository, storage);
    if (!deleted.has(identity)) {
      await storage.deleteCloudinaryAsset(key, resourceType);
      deleted.add(identity);
    }
    await repository.markSourceDeleted(audit.id);
  }
}

export async function cleanupR2Orphans(
  environment: ProductionMediaEnvironment,
  options: ExecutionOptions,
) {
  const repository = new MigrationRepository(environment);
  const storage = new MigrationStorage(environment);
  const [stored, referenced] = await Promise.all([
    storage.listManagedR2Objects(),
    repository.referencedR2Keys(),
  ]);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const allOrphans = stored
    .filter(
      (object) =>
        !referenced.has(object.key) &&
        object.lastModified !== null &&
        object.lastModified.getTime() < cutoff,
    )
    .map((object) => object.key);
  const orphans = options.limit ? allOrphans.slice(0, options.limit) : allOrphans;
  console.log(
    `${options.execute ? "Executing" : "Dry run:"} ${orphans.length} of ${allOrphans.length} R2 orphan(s).`,
  );
  for (const key of orphans) console.log(`- ${key}`);
  if (options.execute && orphans.length) await storage.deleteR2Objects(orphans);
}
