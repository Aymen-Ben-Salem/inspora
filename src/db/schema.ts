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

import type { ImageVariant, VideoPreview } from "@/storage/types";

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
    url: text("url"),
    avatarUrl: text("avatar_url").notNull(),
    avatarStorageProvider: text("avatar_storage_provider"),
    avatarStorageKey: text("avatar_storage_key"),
    ...timestamps,
  },
  (table) => [
    index("creators_name_idx").on(table.name),
    check("creators_name_not_blank", sql`length(trim(${table.name})) > 0`),
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
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sourceMimeType: text("source_mime_type"),
    sizeBytes: integer("size_bytes"),
    alt: text("alt").default("").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("website_media_website_role_unique").on(table.websiteId, table.role),
    check("website_media_role_valid", sql`${table.role} in ('full_page', 'favicon')`),
    check(
      "website_media_storage_consistent",
      sql`(${table.storageProvider} is null and ${table.storageKey} is null) or (${table.storageProvider} = 'r2' and length(trim(${table.storageKey})) > 0)`,
    ),
    check("website_media_size_valid", sql`${table.sizeBytes} is null or ${table.sizeBytes} > 0`),
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
    top: integer("top").notNull(),
    height: integer("height").notNull(),
    position: integer("position").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("website_sections_website_position_unique").on(
      table.websiteId,
      table.position,
    ),
    check("website_sections_label_not_blank", sql`length(trim(${table.label})) > 0`),
    check("website_sections_crop_valid", sql`${table.top} >= 0 and ${table.height} > 0`),
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
      sql`${table.resourceType} in ('post', 'logo', 'website', 'subscriber', 'sponsor')`,
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
}));

export const postsRelations = relations(posts, ({ many, one }) => ({
  creator: one(creators, {
    fields: [posts.creatorId],
    references: [creators.id],
  }),
  media: many(postMedia),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postMedia.postId],
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
