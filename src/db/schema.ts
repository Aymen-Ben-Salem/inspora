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

import type { ImageVariant } from "@/storage/types";

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
      sql`(${table.avatarStorageProvider} is null and ${table.avatarStorageKey} is null) or (${table.avatarStorageProvider} in ('cloudinary', 'r2') and length(trim(${table.avatarStorageKey})) > 0)`,
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
      sql`(${table.storageProvider} is null and ${table.storageKey} is null) or (${table.storageProvider} in ('cloudinary', 'r2') and length(trim(${table.storageKey})) > 0)`,
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
      sql`${table.resourceType} in ('post', 'subscriber')`,
    ),
  ],
);

export const creatorsRelations = relations(creators, ({ many }) => ({
  posts: many(posts),
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
