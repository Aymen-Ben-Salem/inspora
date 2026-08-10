import { neon } from "@neondatabase/serverless";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import {
  creators,
  mediaMigrationAudits,
  postMedia,
} from "../../../src/db/schema";
import type { ProductionMediaEnvironment } from "../production-environment";
import type {
  CreatorAvatarSnapshot,
  MigrationAudit,
  MigrationStatus,
  PostMediaSnapshot,
  SourceSnapshot,
  TargetSnapshot,
} from "./types";

export class MigrationRepository {
  readonly #database;

  constructor(environment: ProductionMediaEnvironment) {
    const client = neon(environment.databaseUrl);
    this.#database = drizzle({ client });
  }

  async listCloudinarySources(): Promise<SourceSnapshot[]> {
    const [mediaRows, creatorRows] = await Promise.all([
      this.#database
        .select()
        .from(postMedia)
        .where(
          and(
            eq(postMedia.storageProvider, "cloudinary"),
            isNotNull(postMedia.storageKey),
          ),
        ),
      this.#database
        .select()
        .from(creators)
        .where(
          and(
            eq(creators.avatarStorageProvider, "cloudinary"),
            isNotNull(creators.avatarStorageKey),
          ),
        ),
    ]);

    return [
      ...mediaRows.map(
        (row): PostMediaSnapshot => ({
          kind: "post_media",
          id: row.id,
          type: row.type as "image" | "video",
          url: row.url,
          posterUrl: row.posterUrl,
          storageProvider: "cloudinary",
          storageKey: row.storageKey,
          mimeType: row.mimeType,
          sourceMimeType: row.sourceMimeType,
          sizeBytes: row.sizeBytes,
          variants: row.variants,
          posterStorageKey: row.posterStorageKey,
          alt: row.alt,
          width: row.width,
          height: row.height,
        }),
      ),
      ...creatorRows.map(
        (row): CreatorAvatarSnapshot => ({
          kind: "creator_avatar",
          id: row.id,
          avatarUrl: row.avatarUrl,
          avatarStorageProvider: "cloudinary",
          avatarStorageKey: row.avatarStorageKey,
        }),
      ),
    ];
  }

  async recordMigration(source: SourceSnapshot, target: TargetSnapshot) {
    const now = new Date();
    const resourceType = source.kind;
    const auditMutation = this.#database
      .insert(mediaMigrationAudits)
      .values({
        resourceType,
        resourceId: source.id,
        status: "migrated",
        sourceProvider: "cloudinary",
        sourceSnapshot: source,
        targetSnapshot: target,
        error: null,
        migratedAt: now,
        rolledBackAt: null,
        sourceDeletedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          mediaMigrationAudits.resourceType,
          mediaMigrationAudits.resourceId,
        ],
        set: {
          status: "migrated",
          sourceSnapshot: source,
          targetSnapshot: target,
          error: null,
          migratedAt: now,
          rolledBackAt: null,
          sourceDeletedAt: null,
          updatedAt: now,
        },
      });

    if (target.kind === "post_media") {
      await this.#database.batch([
        auditMutation,
        this.#database
          .update(postMedia)
          .set({
            type: target.type,
            url: target.url,
            posterUrl: target.posterUrl,
            storageProvider: "r2",
            storageKey: target.storageKey,
            mimeType: target.mimeType,
            sourceMimeType: target.sourceMimeType,
            sizeBytes: target.sizeBytes,
            variants: target.variants,
            posterStorageKey: target.posterStorageKey,
            width: target.width,
            height: target.height,
          })
          .where(eq(postMedia.id, target.id)),
      ]);
      return;
    }

    await this.#database.batch([
      auditMutation,
      this.#database
        .update(creators)
        .set({
          avatarUrl: target.avatarUrl,
          avatarStorageProvider: "r2",
          avatarStorageKey: target.avatarStorageKey,
          updatedAt: now,
        })
        .where(eq(creators.id, target.id)),
    ]);
  }

  async recordFailure(source: SourceSnapshot, error: string) {
    const now = new Date();
    await this.#database
      .insert(mediaMigrationAudits)
      .values({
        resourceType: source.kind,
        resourceId: source.id,
        status: "failed",
        sourceProvider: "cloudinary",
        sourceSnapshot: source,
        error,
      })
      .onConflictDoUpdate({
        target: [
          mediaMigrationAudits.resourceType,
          mediaMigrationAudits.resourceId,
        ],
        set: { status: "failed", error, updatedAt: now },
      });
  }

  async listAudits(statuses?: MigrationStatus[]): Promise<MigrationAudit[]> {
    const rows = await this.#database
      .select()
      .from(mediaMigrationAudits)
      .where(
        statuses?.length
          ? inArray(mediaMigrationAudits.status, statuses)
          : undefined,
      );

    return rows.map((row) => ({
      ...row,
      resourceType: row.resourceType as MigrationAudit["resourceType"],
      status: row.status as MigrationStatus,
      sourceProvider: "cloudinary",
      sourceSnapshot: row.sourceSnapshot as SourceSnapshot,
      targetSnapshot: (row.targetSnapshot as TargetSnapshot | null) ?? null,
    }));
  }

  async getCurrentSnapshot(audit: MigrationAudit): Promise<TargetSnapshot | null> {
    if (audit.resourceType === "post_media") {
      const [row] = await this.#database
        .select()
        .from(postMedia)
        .where(eq(postMedia.id, audit.resourceId))
        .limit(1);
      if (!row) return null;
      return {
        kind: "post_media",
        id: row.id,
        type: row.type as "image" | "video",
        url: row.url,
        posterUrl: row.posterUrl,
        storageProvider: row.storageProvider as "cloudinary" | "r2" | null,
        storageKey: row.storageKey,
        mimeType: row.mimeType,
        sourceMimeType: row.sourceMimeType,
        sizeBytes: row.sizeBytes,
        variants: row.variants,
        posterStorageKey: row.posterStorageKey,
        alt: row.alt,
        width: row.width,
        height: row.height,
      };
    }

    const [row] = await this.#database
      .select()
      .from(creators)
      .where(eq(creators.id, audit.resourceId))
      .limit(1);
    if (!row) return null;
    return {
      kind: "creator_avatar",
      id: row.id,
      avatarUrl: row.avatarUrl,
      avatarStorageProvider: row.avatarStorageProvider as
        | "cloudinary"
        | "r2"
        | null,
      avatarStorageKey: row.avatarStorageKey,
    };
  }

  async restoreSource(audit: MigrationAudit) {
    if (audit.sourceDeletedAt || audit.status === "source_deleted") {
      throw new Error(`Cannot roll back ${audit.resourceType}:${audit.resourceId}; source deleted.`);
    }
    const source = audit.sourceSnapshot;
    const now = new Date();
    const auditMutation = this.#database
      .update(mediaMigrationAudits)
      .set({ status: "rolled_back", rolledBackAt: now, error: null, updatedAt: now })
      .where(eq(mediaMigrationAudits.id, audit.id));

    if (source.kind === "post_media") {
      await this.#database.batch([
        auditMutation,
        this.#database
          .update(postMedia)
          .set({
            type: source.type,
            url: source.url,
            posterUrl: source.posterUrl,
            storageProvider: source.storageProvider,
            storageKey: source.storageKey,
            mimeType: source.mimeType,
            sourceMimeType: source.sourceMimeType,
            sizeBytes: source.sizeBytes,
            variants: source.variants,
            posterStorageKey: source.posterStorageKey,
            alt: source.alt,
            width: source.width,
            height: source.height,
          })
          .where(eq(postMedia.id, source.id)),
      ]);
      return;
    }

    await this.#database.batch([
      auditMutation,
      this.#database
        .update(creators)
        .set({
          avatarUrl: source.avatarUrl,
          avatarStorageProvider: source.avatarStorageProvider,
          avatarStorageKey: source.avatarStorageKey,
          updatedAt: now,
        })
        .where(eq(creators.id, source.id)),
    ]);
  }

  async markSourceDeleted(auditId: string) {
    const now = new Date();
    await this.#database
      .update(mediaMigrationAudits)
      .set({ status: "source_deleted", sourceDeletedAt: now, updatedAt: now })
      .where(eq(mediaMigrationAudits.id, auditId));
  }

  async referencedR2Keys() {
    const [mediaRows, creatorRows] = await Promise.all([
      this.#database
        .select({
          storageKey: postMedia.storageKey,
          posterStorageKey: postMedia.posterStorageKey,
          variants: postMedia.variants,
        })
        .from(postMedia)
        .where(eq(postMedia.storageProvider, "r2")),
      this.#database
        .select({ storageKey: creators.avatarStorageKey })
        .from(creators)
        .where(eq(creators.avatarStorageProvider, "r2")),
    ]);
    return new Set(
      [
        ...mediaRows.flatMap((row) => [
          row.storageKey,
          row.posterStorageKey,
          ...row.variants.map((variant) => variant.storageKey),
        ]),
        ...creatorRows.map((row) => row.storageKey),
      ].filter((value): value is string => Boolean(value)),
    );
  }

  async referencedCloudinaryKeys() {
    const [mediaRows, creatorRows] = await Promise.all([
      this.#database
        .select({ key: postMedia.storageKey, type: postMedia.type })
        .from(postMedia)
        .where(eq(postMedia.storageProvider, "cloudinary")),
      this.#database
        .select({ key: creators.avatarStorageKey })
        .from(creators)
        .where(eq(creators.avatarStorageProvider, "cloudinary")),
    ]);
    return new Set([
      ...mediaRows.flatMap((row) =>
        row.key ? [`${row.type === "video" ? "video" : "image"}:${row.key}`] : [],
      ),
      ...creatorRows.flatMap((row) => (row.key ? [`image:${row.key}`] : [])),
    ]);
  }
}
