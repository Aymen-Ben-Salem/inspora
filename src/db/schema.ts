import { relations, sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ImageVariant, ManagedMediaAsset, VideoPreview } from "@/storage/types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    handle: text("handle"),
    username: text("username"),
    url: text("url"),
    xProfileUrl: text("x_profile_url"),
    // Official X lookup for the editorial link; separate from authenticated ownership.
    xProfileAccountId: text("x_profile_account_id"),
    xProviderId: text("x_provider_id"),
    ownerUserId: text("owner_user_id"),
    editedFields: text("edited_fields").array().default(sql`'{}'::text[]`).notNull(),
    recordOrigin: text("record_origin").default("mirrored").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    avatarStorageProvider: text("avatar_storage_provider"),
    avatarStorageKey: text("avatar_storage_key"),
    trashedAt: timestamp("trashed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    index("creators_name_idx").on(table.name),
    uniqueIndex("creators_owner_user_unique")
      .on(table.ownerUserId)
      .where(sql`${table.ownerUserId} is not null`),
    uniqueIndex("creators_username_lower_unique")
      .on(sql`lower(${table.username})`)
      .where(sql`${table.username} is not null`),
    uniqueIndex("creators_x_provider_unique")
      .on(table.xProviderId)
      .where(sql`${table.xProviderId} is not null`),
    index("creators_x_profile_lower_idx").on(sql`lower(${table.xProfileUrl})`),
    uniqueIndex("creators_x_profile_account_unique").on(table.xProfileAccountId).where(sql`${table.xProfileAccountId} is not null`),
    check("creators_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check(
      "creators_username_valid",
      sql`${table.username} is null or ${table.username} ~ '^[A-Za-z0-9_]{1,30}$'`,
    ),
    check(
      "creators_edited_fields_valid",
      sql`${table.editedFields} <@ array['name', 'username', 'avatarUrl', 'websiteUrl']::text[]`,
    ),
    check(
      "creators_record_origin_valid",
      sql`${table.recordOrigin} in ('mirrored', 'preview', 'development', 'editorial', 'user')`,
    ),
    check(
      "creators_avatar_storage_consistent",
      sql`(${table.avatarStorageProvider} is null and ${table.avatarStorageKey} is null) or (${table.avatarStorageProvider} = 'r2' and length(trim(${table.avatarStorageKey})) > 0)`,
    ),
  ],
);

export const designCategories = pgTable(
  "design_categories",
  {
    name: text("name").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("design_categories_name_lower_unique").on(sql`lower(${table.name})`),
    check("design_categories_name_valid", sql`length(${table.name}) between 1 and 60 and ${table.name} = trim(${table.name}) and lower(${table.name}) not in ('all', 'logos', 'websites', 'app-icons', 'in-review')`),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    category: text("category").notNull().references(() => designCategories.name, { onDelete: "restrict" }),
    industries: text("industries").array().default(sql`'{}'::text[]`).notNull(),
    colors: text("colors").array().default(sql`'{}'::text[]`).notNull(),
    styles: text("styles").array().default(sql`'{}'::text[]`).notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").default("draft").notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("posts_slug_unique").on(table.slug),
    index("posts_created_at_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published'`),
    index("posts_category_created_at_idx")
      .on(table.category, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published'`),
    index("posts_featured_created_at_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published' and ${table.isFeatured} = true`),
    check("posts_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("posts_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("posts_status_valid", sql`${table.status} in ('draft', 'published', 'archived')`),
    check(
      "posts_published_at_required",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check(
      "posts_archived_at_consistent",
      sql`(${table.status} = 'archived' and ${table.archivedAt} is not null) or (${table.status} <> 'archived' and ${table.archivedAt} is null)`,
    ),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    type: text("type").default("image").notNull(),
    url: text("url").notNull(),
    posterUrl: text("poster_url"),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sourceMimeType: text("source_mime_type"),
    sizeBytes: integer("size_bytes"),
    variants: jsonb("variants").$type<ImageVariant[]>().default([]).notNull(),
    videoPreview: jsonb("video_preview").$type<VideoPreview>(),
    posterStorageKey: text("poster_storage_key"),
    alt: text("alt").default("").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("post_media_post_position_unique").on(table.postId, table.position),
    check("post_media_type_valid", sql`${table.type} in ('image', 'video')`),
    check(
      "post_media_storage_consistent",
      sql`(${table.storageProvider} is null and ${table.storageKey} is null) or (${table.storageProvider} = 'r2' and length(trim(${table.storageKey})) > 0)`,
    ),
    check(
      "post_media_size_valid",
      sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`,
    ),
    check(
      "post_media_poster_storage_consistent",
      sql`${table.posterStorageKey} is null or (${table.storageProvider} = 'r2' and ${table.posterUrl} is not null and length(trim(${table.posterStorageKey})) > 0)`,
    ),
    check("post_media_dimensions_valid", sql`${table.width} > 0 and ${table.height} > 0`),
    check("post_media_position_valid", sql`${table.position} >= 0`),
  ],
);

export const savedPosts = pgTable(
  "saved_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    postId: uuid("post_id")
      .references(() => posts.id, { onDelete: "cascade" }),
    logoId: uuid("logo_id").references(() => logos.id, { onDelete: "cascade" }),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("saved_posts_user_post_unique").on(table.userId, table.postId),
    uniqueIndex("saved_posts_user_logo_unique").on(table.userId, table.logoId),
    uniqueIndex("saved_posts_user_website_unique").on(table.userId, table.websiteId),
    check("saved_posts_exactly_one_target", sql`num_nonnulls(${table.postId}, ${table.logoId}, ${table.websiteId}) = 1`),
    index("saved_posts_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check("saved_posts_user_not_blank", sql`length(trim(${table.userId})) > 0`),
  ],
);

export const profileAccounts = pgTable(
  "profile_accounts",
  {
    userId: text("user_id").primaryKey(),
    status: text("status").default("active").notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    deletionError: text("deletion_error"),
    ...timestamps,
  },
  (table) => [
    check("profile_accounts_user_not_blank", sql`length(trim(${table.userId})) > 0`),
    check(
      "profile_accounts_status_valid",
      sql`${table.status} in ('active', 'deleting')`,
    ),
  ],
);

export const submissionUploads = pgTable(
  "submission_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => profileAccounts.userId, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    kind: text("kind").notNull(),
    state: text("state").default("pending").notNull(),
    stagingKey: text("staging_key").notNull(),
    objectKey: text("object_key"),
    derivativeKeys: text("derivative_keys").array().default(sql`'{}'::text[]`).notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    verifiedContentType: text("verified_content_type"),
    verifiedSizeBytes: integer("verified_size_bytes"),
    digest: text("digest"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    attachedSubmissionId: uuid("attached_submission_id"),
    attachedAt: timestamp("attached_at", { withTimezone: true, mode: "date" }),
    discardedAt: timestamp("discarded_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("submission_uploads_owner_request_unique").on(table.ownerUserId, table.requestId),
    index("submission_uploads_owner_active_idx").on(table.ownerUserId, table.state, table.expiresAt),
    uniqueIndex("submission_uploads_object_key_unique").on(table.objectKey).where(sql`${table.objectKey} is not null`),
    uniqueIndex("submission_uploads_attached_submission_unique").on(table.attachedSubmissionId).where(sql`${table.attachedSubmissionId} is not null`),
    check("submission_uploads_kind_valid", sql`${table.kind} in ('design', 'logo')`),
    check("submission_uploads_state_valid", sql`${table.state} in ('pending', 'completed', 'discarded')`),
    check("submission_uploads_size_valid", sql`${table.sizeBytes} > 0`),
    check("submission_uploads_verified_size_valid", sql`${table.verifiedSizeBytes} is null or ${table.verifiedSizeBytes} > 0`),
    check("submission_uploads_completed_consistent", sql`(${table.state} = 'completed' and ${table.objectKey} is not null and ${table.verifiedContentType} is not null and ${table.verifiedSizeBytes} is not null and ${table.digest} is not null and ${table.digest} ~ '^[0-9a-f]{64}$' and ${table.completedAt} is not null) or (${table.state} <> 'completed')`),
    check("submission_uploads_attachment_consistent", sql`(${table.attachedSubmissionId} is null and ${table.attachedAt} is null) or (${table.attachedSubmissionId} is not null and ${table.attachedAt} is not null and ${table.state} = 'completed')`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").notNull().references(() => profileAccounts.userId, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    kind: text("kind").notNull(),
    sourceUrl: text("source_url"),
    uploadId: uuid("upload_id").references(() => submissionUploads.id, { onDelete: "restrict" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    status: text("status").default("in_review").notNull(),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    publishedKind: text("published_kind"),
    publishedId: uuid("published_id"),
    publishedHref: text("published_href"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("submissions_owner_request_unique").on(table.ownerUserId, table.requestId),
    uniqueIndex("submissions_upload_unique").on(table.uploadId).where(sql`${table.uploadId} is not null`),
    uniqueIndex("submissions_owner_active_fingerprint_unique").on(table.ownerUserId, table.sourceFingerprint).where(sql`${table.status} in ('in_review', 'accepted')`),
    index("submissions_owner_status_created_idx").on(table.ownerUserId, table.status, table.createdAt.desc()),
    index("submissions_status_created_idx").on(table.status, table.createdAt),
    check("submissions_kind_valid", sql`${table.kind} in ('design', 'logo', 'website', 'app-icon')`),
    check("submissions_status_valid", sql`${table.status} in ('in_review', 'accepted', 'rejected')`),
    check("submissions_exactly_one_source", sql`num_nonnulls(${table.sourceUrl}, ${table.uploadId}) = 1`),
    check("submissions_rejection_consistent", sql`(${table.status} = 'rejected' and ${table.rejectionReason} is not null and length(trim(${table.rejectionReason})) > 0 and ${table.reviewedAt} is not null and ${table.reviewedBy} is not null and ${table.rejectedAt} is not null and ${table.expiresAt} = ${table.rejectedAt} + interval '48 hours') or (${table.status} <> 'rejected' and ${table.rejectionReason} is null and ${table.rejectedAt} is null and ${table.expiresAt} is null)`),
    check("submissions_acceptance_consistent", sql`(${table.status} = 'accepted' and ${table.reviewedAt} is not null and ${table.reviewedBy} is not null and ${table.publishedKind} is not null and ${table.publishedId} is not null and ${table.publishedHref} is not null) or (${table.status} <> 'accepted' and ${table.publishedKind} is null and ${table.publishedId} is null and ${table.publishedHref} is null)`),
    check("submissions_published_kind_valid", sql`${table.publishedKind} is null or ${table.publishedKind} in ('design', 'logo', 'website')`),
  ],
);

export const submissionPublicationAttempts = pgTable(
  "submission_publication_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Deliberately not a foreign key: a losing publication attempt must retain
    // its asset manifest after withdrawal/account cleanup removes the submission.
    submissionId: uuid("submission_id").notNull(),
    actorId: text("actor_id").notNull(),
    assets: jsonb("assets").$type<ManagedMediaAsset[]>().default([]).notNull(),
    status: text("status").default("prepared").notNull(),
    publishedKind: text("published_kind"),
    publishedId: uuid("published_id"),
    publishedHref: text("published_href"),
    ...timestamps,
  },
  (table) => [
    index("submission_publication_attempts_submission_status_idx").on(
      table.submissionId,
      table.status,
    ),
    check(
      "submission_publication_attempts_actor_not_blank",
      sql`length(trim(${table.actorId})) > 0`,
    ),
    check(
      "submission_publication_attempts_status_valid",
      sql`${table.status} in ('prepared', 'attached', 'cleanup')`,
    ),
    check(
      "submission_publication_attempts_attachment_consistent",
      sql`(${table.status} = 'attached' and ${table.publishedKind} is not null and ${table.publishedId} is not null and ${table.publishedHref} is not null) or (${table.status} <> 'attached' and ${table.publishedKind} is null and ${table.publishedId} is null and ${table.publishedHref} is null)`,
    ),
  ],
);

export const profileMessages = pgTable(
  "profile_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => profileAccounts.userId, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    kind: text("kind").default("submission_accepted").notNull(),
    publishedKind: text("published_kind").notNull(),
    publishedId: uuid("published_id").notNull(),
    publishedHref: text("published_href").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("profile_messages_submission_acceptance_unique").on(table.submissionId),
    index("profile_messages_owner_visible_idx").on(
      table.ownerUserId,
      table.dismissedAt,
      table.createdAt.desc(),
    ),
    index("profile_messages_published_work_idx").on(table.publishedKind, table.publishedId),
    check("profile_messages_kind_valid", sql`${table.kind} = 'submission_accepted'`),
    check(
      "profile_messages_published_work_valid",
      sql`${table.publishedKind} in ('design', 'logo', 'website') and length(trim(${table.publishedHref})) > 0`,
    ),
  ],
);

export const submissionQuotaEvents = pgTable(
  "submission_quota_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").notNull().references(() => profileAccounts.userId, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("submission_quota_events_submission_unique").on(table.submissionId),
    index("submission_quota_events_owner_expiry_idx").on(table.ownerUserId, table.expiresAt),
    check("submission_quota_events_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const submissionReceipts = pgTable(
  "submission_receipts",
  {
    submissionId: uuid("submission_id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => profileAccounts.userId, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    state: text("state").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("submission_receipts_owner_request_unique").on(
      table.ownerUserId,
      table.requestId,
    ),
    index("submission_receipts_expiry_idx").on(table.expiresAt),
    check("submission_receipts_state_valid", sql`${table.state} = 'withdrawn'`),
  ],
);

export const cleanupJobs = pgTable(
  "cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    notBefore: timestamp("not_before", { withTimezone: true, mode: "date" }).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" })
      .notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cleanup_jobs_idempotency_unique").on(table.idempotencyKey),
    index("cleanup_jobs_due_idx").on(table.status, table.nextAttemptAt),
    check("cleanup_jobs_kind_valid", sql`${table.kind} in ('delete_private_upload', 'delete_public_orphan', 'delete_account')`),
    check("cleanup_jobs_status_valid", sql`${table.status} in ('pending', 'leased')`),
    check("cleanup_jobs_attempts_valid", sql`${table.attempts} >= 0`),
    check("cleanup_jobs_target_not_blank", sql`length(trim(${table.targetId})) > 0`),
    check("cleanup_jobs_idempotency_not_blank", sql`length(trim(${table.idempotencyKey})) > 0`),
  ],
);

export const clerkWebhookReceipts = pgTable(
  "clerk_webhook_receipts",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("clerk_webhook_receipts_event_not_blank", sql`length(trim(${table.eventId})) > 0`),
    check("clerk_webhook_receipts_type_valid", sql`${table.eventType} = 'user.deleted'`),
  ],
);

export const creatorUsernameAliases = pgTable(
  "creator_username_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creator_username_aliases_lower_unique").on(
      sql`lower(${table.username})`,
    ),
    uniqueIndex("creator_username_aliases_current_creator_unique")
      .on(table.creatorId)
      .where(sql`${table.isCurrent} = true`),
    index("creator_username_aliases_creator_idx").on(table.creatorId),
    check(
      "creator_username_aliases_username_valid",
      sql`${table.username} ~ '^[A-Za-z0-9_]{1,30}$'`,
    ),
  ],
);

export const creatorClaims = pgTable(
  "creator_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => profileAccounts.userId, { onDelete: "cascade" }),
    targetCreatorId: uuid("target_creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "restrict" }),
    method: text("method").default("x").notNull(),
    verifiedXProviderId: text("verified_x_provider_id"),
    verifiedXUsername: text("verified_x_username"),
    evidenceUrl: text("evidence_url"),
    evidenceNote: text("evidence_note"),
    attentionReason: text("attention_reason"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
    status: text("status").default("pending").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewReason: text("review_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("creator_claims_pending_requester_unique").on(table.requesterUserId)
      .where(sql`${table.status} = 'pending'`),
    index("creator_claims_status_created_idx").on(
      table.status,
      table.createdAt.desc(),
    ),
    index("creator_claims_target_status_idx").on(table.targetCreatorId, table.status),
    index("creator_claims_provider_idx").on(table.verifiedXProviderId),
    check(
      "creator_claims_provider_not_blank",
      sql`${table.verifiedXProviderId} is null or length(trim(${table.verifiedXProviderId})) > 0`,
    ),
    check(
      "creator_claims_username_valid",
      sql`${table.verifiedXUsername} is null or ${table.verifiedXUsername} ~ '^[a-z0-9_]{1,15}$'`,
    ),
    check("creator_claims_evidence_valid", sql`
      (${table.method} = 'x' and ${table.verifiedXProviderId} is not null and ${table.verifiedXUsername} is not null)
      or (${table.method} in ('manual', 'ownership_report') and ${table.verifiedXProviderId} is null and ${table.verifiedXUsername} is null
        and ${table.evidenceUrl} is not null and ${table.evidenceNote} is not null
        and length(trim(${table.evidenceUrl})) > 0 and length(trim(${table.evidenceNote})) >= 20)
    `),
    check(
      "creator_claims_status_valid",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'withdrawn', 'resolved')`,
    ),
    check(
      "creator_claims_review_consistent",
      sql`(${table.status} in ('pending', 'withdrawn') and ${table.reviewedAt} is null and ${table.reviewedBy} is null) or (${table.status} in ('approved', 'rejected', 'resolved') and ${table.reviewedAt} is not null and (${table.reviewedBy} is not null or (${table.status} = 'approved' and ${table.method} = 'x')))`,
    ),
  ],
);

export const logos = pgTable(
  "logos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: text("kind").default("logo").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    industry: text("industry").notNull(),
    colors: text("colors").array().default(sql`'{}'::text[]`).notNull(),
    styles: text("styles").array().default(sql`'{}'::text[]`).notNull(),
    shape: text("shape").notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("logos_slug_unique").on(table.slug),
    index("logos_kind_created_at_idx")
      .on(table.kind, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published'`),
    index("logos_created_at_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published'`),
    check("logos_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("logos_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("logos_kind_valid", sql`${table.kind} in ('logo', 'icon')`),
    check("logos_industry_not_blank", sql`length(trim(${table.industry})) > 0`),
    check("logos_shape_not_blank", sql`length(trim(${table.shape})) > 0`),
    check("logos_status_valid", sql`${table.status} in ('draft', 'published', 'archived')`),
    check(
      "logos_published_at_required",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check(
      "logos_archived_at_consistent",
      sql`(${table.status} = 'archived' and ${table.archivedAt} is not null) or (${table.status} <> 'archived' and ${table.archivedAt} is null)`,
    ),
  ],
);

export const logoMedia = pgTable(
  "logo_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    logoId: uuid("logo_id")
      .notNull()
      .references(() => logos.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sourceMimeType: text("source_mime_type"),
    sizeBytes: integer("size_bytes"),
    variants: jsonb("variants").$type<ImageVariant[]>().default([]).notNull(),
    alt: text("alt").default("").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("logo_media_logo_unique").on(table.logoId),
    check(
      "logo_media_storage_consistent",
      sql`(${table.storageProvider} is null and ${table.storageKey} is null) or (${table.storageProvider} = 'r2' and length(trim(${table.storageKey})) > 0)`,
    ),
    check("logo_media_size_valid", sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`),
    check("logo_media_dimensions_valid", sql`${table.width} > 0 and ${table.height} > 0`),
  ],
);

export const websites = pgTable(
  "websites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    tagline: text("tagline").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    categories: text("categories").array().default(sql`'{}'::text[]`).notNull(),
    themes: text("themes").array().default(sql`'{}'::text[]`).notNull(),
    colors: text("colors").array().default(sql`'{}'::text[]`).notNull(),
    technologies: text("technologies").array().default(sql`'{}'::text[]`).notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").default("draft").notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("websites_slug_unique").on(table.slug),
    index("websites_created_at_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published'`),
    index("websites_featured_created_at_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'published' and ${table.isFeatured} = true`),
    check("websites_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("websites_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("websites_tagline_not_blank", sql`length(trim(${table.tagline})) > 0`),
    check("websites_status_valid", sql`${table.status} in ('draft', 'published', 'archived')`),
    check(
      "websites_published_at_required",
      sql`${table.status} <> 'published' or ${table.publishedAt} is not null`,
    ),
    check(
      "websites_archived_at_consistent",
      sql`(${table.status} = 'archived' and ${table.archivedAt} is not null) or (${table.status} <> 'archived' and ${table.archivedAt} is null)`,
    ),
  ],
);

export const websiteMedia = pgTable(
  "website_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    url: text("url").notNull(),
    posterUrl: text("poster_url"),
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sourceMimeType: text("source_mime_type"),
    sizeBytes: integer("size_bytes"),
    variants: jsonb("variants").$type<ImageVariant[]>().default([]).notNull(),
    videoPreview: jsonb("video_preview").$type<VideoPreview>(),
    posterStorageKey: text("poster_storage_key"),
    alt: text("alt").default("").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("website_media_website_role_unique").on(table.websiteId, table.role),
    check(
      "website_media_role_valid",
      sql`${table.role} in ('full_page', 'recording', 'favicon')`,
    ),
    check(
      "website_media_storage_consistent",
      sql`(${table.storageProvider} is null and ${table.storageKey} is null) or (${table.storageProvider} = 'r2' and length(trim(${table.storageKey})) > 0)`,
    ),
    check("website_media_size_valid", sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`),
    check(
      "website_media_poster_storage_consistent",
      sql`${table.posterStorageKey} is null or (${table.storageProvider} = 'r2' and ${table.posterUrl} is not null and length(trim(${table.posterStorageKey})) > 0)`,
    ),
    check("website_media_dimensions_valid", sql`${table.width} > 0 and ${table.height} > 0`),
  ],
);

export const websiteSections = pgTable(
  "website_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    top: integer("top"),
    height: integer("height"),
    position: integer("position").notNull(),
    imageUrl: text("image_url"),
    imageStorageProvider: text("image_storage_provider"),
    imageStorageKey: text("image_storage_key"),
    imageMimeType: text("image_mime_type"),
    imageSourceMimeType: text("image_source_mime_type"),
    imageSizeBytes: integer("image_size_bytes"),
    imageVariants: jsonb("image_variants")
      .$type<ImageVariant[]>()
      .default([])
      .notNull(),
    imageAlt: text("image_alt").default("").notNull(),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("website_sections_website_position_unique").on(
      table.websiteId,
      table.position,
    ),
    check("website_sections_label_not_blank", sql`length(trim(${table.label})) > 0`),
    check(
      "website_sections_crop_valid",
      sql`(${table.top} is null and ${table.height} is null) or (${table.top} >= 0 and ${table.height} > 0)`,
    ),
    check(
      "website_sections_image_storage_consistent",
      sql`(${table.imageStorageProvider} is null and ${table.imageStorageKey} is null) or (${table.imageStorageProvider} = 'r2' and length(trim(${table.imageStorageKey})) > 0)`,
    ),
    check(
      "website_sections_image_size_valid",
      sql`${table.imageSizeBytes} is null or ${table.imageSizeBytes} > 0`,
    ),
    check(
      "website_sections_image_dimensions_valid",
      sql`(${table.imageWidth} is null and ${table.imageHeight} is null) or (${table.imageWidth} > 0 and ${table.imageHeight} > 0)`,
    ),
    check("website_sections_position_valid", sql`${table.position} >= 0`),
  ],
);

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    source: text("source").default("website").notNull(),
    status: text("status").default("active").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscribers_email_unique").on(table.email),
    index("subscribers_status_created_at_idx").on(table.status, table.createdAt.desc()),
    check("subscribers_email_length", sql`length(${table.email}) between 3 and 254`),
    check("subscribers_status_valid", sql`${table.status} in ('active', 'unsubscribed')`),
    check(
      "subscribers_unsubscribed_at_consistent",
      sql`(${table.status} = 'unsubscribed' and ${table.unsubscribedAt} is not null) or (${table.status} = 'active' and ${table.unsubscribedAt} is null)`,
    ),
  ],
);

export const sponsors = pgTable(
  "sponsors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    tagline: text("tagline"),
    mediaType: text("media_type").default("image").notNull(),
    mediaUrl: text("media_url"),
    mediaPosterUrl: text("media_poster_url"),
    mediaStorageProvider: text("media_storage_provider"),
    mediaStorageKey: text("media_storage_key"),
    mediaPosterStorageKey: text("media_poster_storage_key"),
    mediaWidth: integer("media_width").default(1200).notNull(),
    mediaHeight: integer("media_height").default(800).notNull(),
    mediaVariants: jsonb("media_variants").$type<ImageVariant[]>().default([]).notNull(),
    mediaVideoPreview: jsonb("media_video_preview").$type<VideoPreview>(),
    mediaAlt: text("media_alt").default("").notNull(),
    iconUrl: text("icon_url"),
    iconStorageProvider: text("icon_storage_provider"),
    iconStorageKey: text("icon_storage_key"),
    isActive: boolean("is_active").default(true).notNull(),
    ownerUserId: text("owner_user_id").references(() => sponsorIdentities.userId),
    accountId: uuid("account_id").references(() => sponsorAccounts.id),
    campaignState: text("campaign_state").default("legacy").notNull(),
    internalName: text("internal_name"),
    revision: integer("revision").default(0).notNull(),
    wordmarkUrl: text("wordmark_url"),
    wordmarkStorageKey: text("wordmark_storage_key"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    check("sponsors_title_not_blank", sql`length(trim(${table.title})) > 0`),
    uniqueIndex("sponsors_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("sponsors_one_published_per_account").on(table.accountId).where(sql`${table.campaignState} = 'published'`),
    check("sponsors_campaign_state_valid", sql`${table.campaignState} in ('legacy','prepared','draft','published','archived')`),
    check("sponsors_owned_legacy_inactive", sql`(${table.ownerUserId} is null and ${table.accountId} is null and ${table.campaignState} = 'legacy') or (${table.ownerUserId} is not null and ${table.campaignState} <> 'legacy' and not ${table.isActive})`),
    check("sponsors_revision_valid", sql`${table.revision} >= 0`),
    check("sponsors_published_has_account", sql`${table.campaignState} <> 'published' or ${table.accountId} is not null`),
    foreignKey({ name: "sponsors_account_owner_fk", columns: [table.accountId, table.ownerUserId], foreignColumns: [sponsorAccounts.id, sponsorAccounts.ownerUserId] }),
    check("sponsors_url_not_blank", sql`length(trim(${table.url})) > 0`),
    check("sponsors_media_type_valid", sql`${table.mediaType} in ('image', 'video')`),
    check("sponsors_media_dimensions_valid", sql`${table.mediaWidth} > 0 and ${table.mediaHeight} > 0`),
    check(
      "sponsors_media_storage_consistent",
      sql`(${table.mediaStorageProvider} is null and ${table.mediaStorageKey} is null) or (${table.mediaStorageProvider} = 'r2' and length(trim(${table.mediaStorageKey})) > 0)`,
    ),
    check(
      "sponsors_icon_storage_consistent",
      sql`(${table.iconStorageProvider} is null and ${table.iconStorageKey} is null) or (${table.iconStorageProvider} = 'r2' and length(trim(${table.iconStorageKey})) > 0)`,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("admin_audit_logs_created_at_idx").on(table.createdAt.desc()),
    index("admin_audit_logs_actor_created_at_idx").on(table.actorId, table.createdAt.desc()),
    check("admin_audit_logs_actor_not_blank", sql`length(trim(${table.actorId})) > 0`),
    check("admin_audit_logs_action_not_blank", sql`length(trim(${table.action})) > 0`),
    check(
      "admin_audit_logs_resource_type_valid",
      sql`${table.resourceType} in ('post', 'logo', 'website', 'subscriber', 'sponsor', 'creator', 'creator_claim', 'category')`,
    ),
  ],
);

export const mediaMigrationAudits = pgTable(
  "media_migration_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    status: text("status").default("uploaded").notNull(),
    sourceProvider: text("source_provider").notNull(),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    targetSnapshot: jsonb("target_snapshot")
      .$type<Record<string, unknown>>(),
    error: text("error"),
    migratedAt: timestamp("migrated_at", { withTimezone: true, mode: "date" }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: "date" }),
    sourceDeletedAt: timestamp("source_deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("media_migration_audits_resource_unique").on(
      table.resourceType,
      table.resourceId,
    ),
    index("media_migration_audits_status_idx").on(table.status),
    check(
      "media_migration_audits_resource_type_valid",
      sql`${table.resourceType} in ('post_media', 'creator_avatar')`,
    ),
    check(
      "media_migration_audits_status_valid",
      sql`${table.status} in ('uploaded', 'migrated', 'failed', 'rolled_back', 'source_deleted')`,
    ),
    check(
      "media_migration_audits_source_provider_valid",
      sql`${table.sourceProvider} = 'cloudinary'`,
    ),
  ],
);

export const creatorsRelations = relations(creators, ({ many }) => ({
  posts: many(posts),
  logos: many(logos),
  websites: many(websites),
  aliases: many(creatorUsernameAliases),
  claims: many(creatorClaims),
}));

export const creatorUsernameAliasesRelations = relations(
  creatorUsernameAliases,
  ({ one }) => ({
    creator: one(creators, {
      fields: [creatorUsernameAliases.creatorId],
      references: [creators.id],
    }),
  }),
);

export const creatorClaimsRelations = relations(creatorClaims, ({ one }) => ({
  requester: one(profileAccounts, {
    fields: [creatorClaims.requesterUserId],
    references: [profileAccounts.userId],
  }),
  targetCreator: one(creators, {
    fields: [creatorClaims.targetCreatorId],
    references: [creators.id],
  }),
}));

export const postsRelations = relations(posts, ({ many, one }) => ({
  creator: one(creators, {
    fields: [posts.creatorId],
    references: [creators.id],
  }),
  media: many(postMedia),
  saves: many(savedPosts),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postMedia.postId],
    references: [posts.id],
  }),
}));

export const savedPostsRelations = relations(savedPosts, ({ one }) => ({
  logo: one(logos, {
    fields: [savedPosts.logoId],
    references: [logos.id],
  }),
  website: one(websites, {
    fields: [savedPosts.websiteId],
    references: [websites.id],
  }),
  post: one(posts, {
    fields: [savedPosts.postId],
    references: [posts.id],
  }),
}));

export const logosRelations = relations(logos, ({ many, one }) => ({
  creator: one(creators, {
    fields: [logos.creatorId],
    references: [creators.id],
  }),
  media: many(logoMedia),
}));

export const logoMediaRelations = relations(logoMedia, ({ one }) => ({
  logo: one(logos, {
    fields: [logoMedia.logoId],
    references: [logos.id],
  }),
}));

export const websitesRelations = relations(websites, ({ many, one }) => ({
  creator: one(creators, {
    fields: [websites.creatorId],
    references: [creators.id],
  }),
  media: many(websiteMedia),
  sections: many(websiteSections),
}));

export const websiteMediaRelations = relations(websiteMedia, ({ one }) => ({
  website: one(websites, {
    fields: [websiteMedia.websiteId],
    references: [websites.id],
  }),
}));

export const websiteSectionsRelations = relations(websiteSections, ({ one }) => ({
  website: one(websites, {
    fields: [websiteSections.websiteId],
    references: [websites.id],
  }),
}));

// One latest successful aggregate per creator/configuration; no visitor events.
export const creatorViewSnapshots = pgTable("creator_view_snapshots", {
  key: text("key").primaryKey(),
  eligibilityFingerprint: text("eligibility_fingerprint").notNull(),
  count: bigint("count", { mode: "number" }).notNull(),
  asOf: timestamp("as_of", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [check("creator_view_snapshot_count_valid", sql`${table.count} >= 0 and ${table.count} <= 9007199254740991`)]);

// Sponsor access survives unpaid preparation expiry; it grants no creator or paid entitlement.
export const sponsorIdentities = pgTable("sponsor_identities", {
  userId: text("user_id").primaryKey(),
  state: text("state").default("allowed").notNull(),
  ...timestamps,
}, t => [check("sponsor_identities_state_valid", sql`${t.state} in ('allowed','revoked','deleting')`)]);

export const sponsorAccounts = pgTable("sponsor_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => sponsorIdentities.userId),
  state: text("state").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  paidThrough: timestamp("paid_through", { withTimezone: true, mode: "date" }),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }),
  recoveryDeadline: timestamp("recovery_deadline", { withTimezone: true, mode: "date" }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  billingCurrency: text("billing_currency").default("usd").notNull(),
  billingMode: text("billing_mode").$type<import("@/features/sponsorship/purchase-mode").SponsorBillingMode>().default("subscription").notNull(),
  billingInterval: text("billing_interval").default("day").notNull(),
  billingIntervalCount: integer("billing_interval_count").default(30).notNull(),
  ...timestamps,
}, t => [
  uniqueIndex("sponsor_accounts_owner_unique").on(t.ownerUserId),
  uniqueIndex("sponsor_accounts_id_owner_unique").on(t.id, t.ownerUserId),
  uniqueIndex("sponsor_accounts_subscription_unique").on(t.stripeSubscriptionId),
  check("sponsor_accounts_state_valid", sql`${t.state} in ('active','recovery','inactive','revoked','deleting')`),
  check("sponsor_accounts_billing_mode_valid", sql`${t.billingMode} in ('one_time','subscription')`),
  check("sponsor_accounts_billing_terms_valid", sql`(${t.billingCurrency} in ('usd','eur') and ${t.billingInterval} = 'month' and ${t.billingIntervalCount} = 1) or (${t.billingCurrency} = 'usd' and ${t.billingInterval} = 'day' and ${t.billingIntervalCount} = 30)`),
]);

export const sponsorCheckouts = pgTable("sponsor_checkouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => sponsorIdentities.userId),
  campaignId: uuid("campaign_id").references(() => sponsors.id),
  state: text("state").default("preparing").notNull(),
  revision: integer("revision").default(0).notNull(),
  snapshot: jsonb("snapshot").$type<import("@/features/sponsorship/types").SponsorCheckoutSnapshot>(),
  stripeSessionId: text("stripe_session_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  priceId: text("price_id"),
  billingMode: text("billing_mode").$type<import("@/features/sponsorship/purchase-mode").SponsorBillingMode>().default("subscription").notNull(),
  paymentReceivedAt: timestamp("payment_received_at", { withTimezone: true, mode: "date" }),
  paidInvoiceId: text("paid_invoice_id"),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  exceptionCode: text("exception_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps,
}, t => [
  uniqueIndex("sponsor_checkouts_id_owner_unique").on(t.id, t.ownerUserId),
  uniqueIndex("sponsor_checkouts_session_unique").on(t.stripeSessionId),
  uniqueIndex("sponsor_checkouts_subscription_unique").on(t.stripeSubscriptionId),
  uniqueIndex("sponsor_checkouts_one_open_per_owner").on(t.ownerUserId).where(sql`${t.state} in ('preparing','ready','reserved')`),
  index("sponsor_checkouts_expiry_idx").on(t.state, t.expiresAt),
  check("sponsor_checkouts_state_valid", sql`${t.state} in ('preparing','ready','reserved','expired','completed')`),
  check("sponsor_checkouts_billing_mode_valid", sql`${t.billingMode} in ('one_time','subscription')`),
  check("sponsor_checkouts_revision_valid", sql`${t.revision} >= 0`),
  foreignKey({ name: "sponsor_checkouts_campaign_owner_fk", columns: [t.campaignId, t.ownerUserId], foreignColumns: [sponsors.id, sponsors.ownerUserId] }),
]);

export const sponsorSeats = pgTable("sponsor_seats", {
  slot: integer("slot").primaryKey(),
  state: text("state").default("free").notNull(),
  accountId: uuid("account_id").references(() => sponsorAccounts.id),
  checkoutId: uuid("checkout_id").references(() => sponsorCheckouts.id),
  reservedUntil: timestamp("reserved_until", { withTimezone: true, mode: "date" }),
}, t => [
  uniqueIndex("sponsor_seats_account_unique").on(t.accountId),
  uniqueIndex("sponsor_seats_checkout_unique").on(t.checkoutId),
  check("sponsor_seats_slot_valid", sql`${t.slot} between 1 and 4`),
  check("sponsor_seats_state_valid", sql`${t.state} in ('free','reserved','occupied','releasing')`),
  check("sponsor_seats_binding_valid", sql`(${t.state} = 'free' and ${t.accountId} is null and ${t.checkoutId} is null and ${t.reservedUntil} is null) or (${t.state} = 'reserved' and ${t.checkoutId} is not null and ${t.accountId} is null and ${t.reservedUntil} is not null) or (${t.state} in ('occupied','releasing') and ${t.accountId} is not null)`),
]);

export const sponsorCampaignVersions = pgTable("sponsor_campaign_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => sponsors.id),
  ownerUserId: text("owner_user_id").notNull().references(() => sponsorIdentities.userId),
  revision: integer("revision").notNull(),
  creative: jsonb("creative").$type<import("@/features/sponsorship/types").CreativeSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, t => [
  uniqueIndex("sponsor_versions_campaign_revision_unique").on(t.campaignId, t.revision),
  uniqueIndex("sponsor_versions_id_owner_unique").on(t.id, t.ownerUserId),
  check("sponsor_versions_revision_valid", sql`${t.revision} > 0`),
  foreignKey({ name: "sponsor_versions_campaign_owner_fk", columns: [t.campaignId, t.ownerUserId], foreignColumns: [sponsors.id, sponsors.ownerUserId] }),
]);

export const sponsorAssets = pgTable("sponsor_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => sponsorIdentities.userId),
  checkoutId: uuid("checkout_id").notNull().references(() => sponsorCheckouts.id),
  sourceAssetId: uuid("source_asset_id"),
  kind: text("kind").notNull(), state: text("state").default("pending").notNull(),
  contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(),
  stagingKey: text("staging_key").notNull(), objectKey: text("object_key"), digest: text("digest"),
  width: integer("width"), height: integer("height"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps,
}, t => [
  uniqueIndex("sponsor_assets_id_owner_unique").on(t.id, t.ownerUserId),
  uniqueIndex("sponsor_assets_id_owner_checkout_unique").on(t.id, t.ownerUserId, t.checkoutId),
  uniqueIndex("sponsor_assets_staging_unique").on(t.stagingKey),
  index("sponsor_assets_expiry_idx").on(t.state, t.expiresAt),
  check("sponsor_assets_kind_valid", sql`${t.kind} in ('original','media','icon','wordmark','poster','video-preview','variant')`),
  check("sponsor_assets_source_valid", sql`${t.sourceAssetId} is null or (${t.sourceAssetId} <> ${t.id} and ${t.kind} <> 'original')`),
  check("sponsor_assets_state_valid", sql`${t.state} in ('pending','verified','deleting')`),
  check("sponsor_assets_size_valid", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 52428800`),
  check("sponsor_assets_dimensions_valid", sql`(${t.width} is null and ${t.height} is null) or (${t.width} > 0 and ${t.height} > 0)`),
  check("sponsor_assets_verified_complete", sql`${t.state} <> 'verified' or (${t.objectKey} is not null and ${t.digest} is not null and ${t.digest} ~ '^[a-f0-9]{64}$' and ${t.width} is not null and ${t.height} is not null and ${t.width} > 0 and ${t.height} > 0)`),
  foreignKey({ name: "sponsor_assets_checkout_owner_fk", columns: [t.checkoutId, t.ownerUserId], foreignColumns: [sponsorCheckouts.id, sponsorCheckouts.ownerUserId] }),
  foreignKey({ name: "sponsor_assets_source_owner_checkout_fk", columns: [t.sourceAssetId, t.ownerUserId, t.checkoutId], foreignColumns: [t.id, t.ownerUserId, t.checkoutId] }),
]);

export const sponsorVersionAssets = pgTable("sponsor_version_assets", {
  versionId: uuid("version_id").notNull().references(() => sponsorCampaignVersions.id),
  assetId: uuid("asset_id").notNull().references(() => sponsorAssets.id),
  ownerUserId: text("owner_user_id").notNull(),
}, t => [
  uniqueIndex("sponsor_version_assets_unique").on(t.versionId, t.assetId),
  foreignKey({ name: "sponsor_version_assets_version_owner_fk", columns: [t.versionId, t.ownerUserId], foreignColumns: [sponsorCampaignVersions.id, sponsorCampaignVersions.ownerUserId] }),
  foreignKey({ name: "sponsor_version_assets_asset_owner_fk", columns: [t.assetId, t.ownerUserId], foreignColumns: [sponsorAssets.id, sponsorAssets.ownerUserId] }),
]);

export const sponsorBillingEvents = pgTable("sponsor_billing_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  objectId: text("object_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export const sponsorJobs = pgTable("sponsor_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  state: text("state").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
  leaseToken: uuid("lease_token"),
  errorCode: text("error_code"),
  ...timestamps,
}, t => [
  uniqueIndex("sponsor_jobs_idempotency_unique").on(t.idempotencyKey),
  index("sponsor_jobs_ready_idx").on(t.state, t.nextAttemptAt),
  check("sponsor_jobs_kind_valid", sql`${t.kind} in ('reconcile','event','delete_owner')`),
  check("sponsor_jobs_state_valid", sql`${t.state} in ('pending','running','complete')`),
  check("sponsor_jobs_attempts_valid", sql`${t.attempts} >= 0`),
]);

export const analyticsIdentityEpochs = pgTable("analytics_identity_epochs", {
  month: text("month").primaryKey(),
  encryptedSecret: text("encrypted_secret").notNull(),
  destroyAt: timestamp("destroy_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    occurrenceId: uuid("occurrence_id").primaryKey(),
    dedupKey: text("dedup_key"),
    kind: text("kind").notNull(),
    pageId: uuid("page_id").notNull(),
    campaignId: uuid("campaign_id").references(() => sponsors.id),
    versionId: uuid("version_id").references(() => sponsorCampaignVersions.id),
    placement: text("placement"),
    milestone: integer("milestone"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    visitorKey: text("visitor_key"),
    countryCode: text("country_code"),
    device: text("device").notNull(),
    referrerDomain: text("referrer_domain"),
  },
  (t) => [
    uniqueIndex("analytics_events_dedup_unique").on(t.dedupKey),
    index("analytics_events_campaign_time_idx").on(t.campaignId, t.occurredAt),
    index("analytics_events_time_idx").on(t.occurredAt),
    index("analytics_events_visitor_accepted_idx").on(
      t.visitorKey,
      t.acceptedAt,
    ),
    check(
      "analytics_events_kind_valid",
      sql`${t.kind} in ('site_page_view','sponsor_impression','sponsor_click','sponsor_preview_started','sponsor_preview_view','sponsor_preview_progress')`,
    ),
    check(
      "analytics_events_binding_valid",
      sql`(${t.kind} = 'site_page_view' and ${t.campaignId} is null and ${t.versionId} is null and ${t.placement} is null) or (${t.kind} <> 'site_page_view' and ${t.campaignId} is not null and ${t.versionId} is not null and ${t.placement} in ('header','feed','detail'))`,
    ),
    check(
      "analytics_events_device_valid",
      sql`${t.device} in ('desktop','mobile','tablet','unknown')`,
    ),
    check(
      "analytics_events_milestone_valid",
      sql`(${t.kind} = 'sponsor_preview_progress' and ${t.milestone} in (25,50,75,100)) or (${t.kind} <> 'sponsor_preview_progress' and ${t.milestone} is null)`,
    ),
  ],
);
export const analyticsOccurrences = pgTable("analytics_occurrences", {
  occurrenceId: uuid("occurrence_id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});
export const analyticsRateBuckets = pgTable("analytics_rate_buckets", {
  key: text("key").primaryKey(),
  events: integer("events").notNull(),
  receipts: integer("receipts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
}, t => [index("analytics_rate_buckets_expiry_idx").on(t.expiresAt)]);
export const analyticsReports = pgTable("analytics_reports", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  filter: jsonb("filter").$type<Record<string, unknown>>().notNull(),
  data: jsonb("data")
    .$type<import("@/analytics/first-party/query").MetricsReport>()
    .notNull(),
  asOf: timestamp("as_of", { withTimezone: true, mode: "date" }).notNull(),
  refreshAt: timestamp("refresh_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
export const sponsorDeliveryPeriods = pgTable(
  "sponsor_delivery_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => sponsorAccounts.id),
    paymentId: text("payment_id").notNull(),
    startAt: timestamp("start_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    baseAmount: integer("base_amount"),
    currency: text("currency").notNull(),
  },
  (t) => [
    uniqueIndex("sponsor_delivery_period_payment_unique").on(t.paymentId),
    check(
      "sponsor_delivery_period_valid",
      sql`${t.endAt} > ${t.startAt} and (${t.baseAmount} is null or ${t.baseAmount} >= 0) and ${t.currency} in ('usd','eur')`,
    ),
  ],
);
export const sponsorDeliveryIntervals = pgTable(
  "sponsor_delivery_intervals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => sponsorAccounts.id),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => sponsors.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => sponsorCampaignVersions.id),
    startAt: timestamp("start_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("sponsor_delivery_intervals_account_time_idx").on(
      t.accountId,
      t.startAt,
    ),
    uniqueIndex("sponsor_delivery_one_open_unique")
      .on(t.accountId)
      .where(sql`${t.endAt} is null`),
    check(
      "sponsor_delivery_interval_valid",
      sql`${t.endAt} is null or ${t.endAt} >= ${t.startAt}`,
    ),
  ],
);
