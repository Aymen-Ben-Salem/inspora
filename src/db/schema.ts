import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
    xProviderId: text("x_provider_id"),
    ownerUserId: text("owner_user_id"),
    editedFields: text("edited_fields").array().default(sql`'{}'::text[]`).notNull(),
    recordOrigin: text("record_origin").default("mirrored").notNull(),
    avatarUrl: text("avatar_url").notNull(),
    avatarStorageProvider: text("avatar_storage_provider"),
    avatarStorageKey: text("avatar_storage_key"),
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
    check("creators_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check(
      "creators_username_valid",
      sql`${table.username} is null or ${table.username} ~ '^[a-z0-9_]{3,30}$'`,
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
    category: text("category").notNull(),
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
    check(
      "posts_category_valid",
      sql`${table.category} in ('Web', 'Branding', 'Product', 'Motion', 'Illustration', '3D', 'Print')`,
    ),
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

export const cleanupJobs = pgTable(
  "cleanup_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    notBefore: timestamp("not_before", { withTimezone: true, mode: "date" }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cleanup_jobs_idempotency_unique").on(table.idempotencyKey),
    index("cleanup_jobs_not_before_idx").on(table.notBefore),
    check("cleanup_jobs_kind_valid", sql`${table.kind} in ('delete_private_upload', 'delete_public_orphan', 'delete_account')`),
    check("cleanup_jobs_target_not_blank", sql`length(trim(${table.targetId})) > 0`),
    check("cleanup_jobs_idempotency_not_blank", sql`length(trim(${table.idempotencyKey})) > 0`),
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
      sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`,
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
    verifiedXProviderId: text("verified_x_provider_id").notNull(),
    verifiedXUsername: text("verified_x_username").notNull(),
    status: text("status").default("pending").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewReason: text("review_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("creator_claims_request_unique").on(
      table.requesterUserId,
      table.targetCreatorId,
      table.verifiedXProviderId,
    ),
    index("creator_claims_status_created_idx").on(
      table.status,
      table.createdAt.desc(),
    ),
    index("creator_claims_target_status_idx").on(table.targetCreatorId, table.status),
    index("creator_claims_provider_idx").on(table.verifiedXProviderId),
    check(
      "creator_claims_provider_not_blank",
      sql`length(trim(${table.verifiedXProviderId})) > 0`,
    ),
    check(
      "creator_claims_username_valid",
      sql`${table.verifiedXUsername} ~ '^[a-z0-9_]{1,15}$'`,
    ),
    check(
      "creator_claims_status_valid",
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "creator_claims_review_consistent",
      sql`(${table.status} = 'pending' and ${table.reviewedAt} is null and ${table.reviewedBy} is null) or (${table.status} <> 'pending' and ${table.reviewedAt} is not null and ${table.reviewedBy} is not null)`,
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
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (table) => [
    check("sponsors_title_not_blank", sql`length(trim(${table.title})) > 0`),
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
      sql`${table.resourceType} in ('post', 'logo', 'website', 'subscriber', 'sponsor', 'creator', 'creator_claim')`,
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
