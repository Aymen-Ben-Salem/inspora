import "server-only";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { creators, posts, postMedia, logos, logoMedia, websites, websiteMedia, websiteSections } from "@/db/schema";
import { POST_CATEGORIES, isPostCategory } from "@/domain/post";
import type { WorkCardData } from "@/domain/work-card";
import type { ProfileWorkCounts } from "@/features/profiles/types";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { PUBLIC_WORK_CACHE_LIFE, PUBLISHED_POSTS_CACHE_TAG, PUBLISHED_LOGOS_CACHE_TAG, PUBLISHED_WEBSITES_CACHE_TAG } from "./cache";
import { evaluationTime } from "./clock";
import { mapPostCard } from "./design-presentation";
import { mapPublishedLogo } from "./logo-presentation";
import { completeWebsiteRecordingPredicate, hasCompleteRecording, mapPublishedWebsite } from "./website-presentation";

export const creatorScopeSchema = z.strictObject({ kind: z.literal("creator"), creatorId: z.uuid() });
const filterSchema = z.enum(["all", "websites", "logos", "app-icons", ...POST_CATEGORIES]);
export const creatorCountRequestSchema = z.strictObject({
  scope: creatorScopeSchema,
  filters: z.strictObject({ filter: filterSchema.optional() }).optional(),
});
export const creatorPageRequestSchema = creatorCountRequestSchema.extend({
  order: z.literal("publication-desc"), cursor: z.string().min(1).nullable().optional(),
});
export type CreatorWorkCountRequest = z.infer<typeof creatorCountRequestSchema>;
export type CreatorWorkPageRequest = z.infer<typeof creatorPageRequestSchema>;
const keysSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["post", "website", "logo", "icon"]), publishedAt: z.iso.datetime(),
});
const cursorSchema = z.strictObject({
  v: z.literal(1), scope: creatorScopeSchema, filter: filterSchema,
  order: z.literal("publication-desc"), keys: keysSchema,
});
type CursorKeys = z.infer<typeof keysSchema>;
export const creatorKindRank = (kind: CursorKeys["kind"]) => ({ website: 4, post: 3, logo: 2, icon: 1 })[kind];
export function encodeCreatorCursor(keys: CursorKeys, request: CreatorWorkCountRequest) {
  return Buffer.from(JSON.stringify({ v: 1, scope: request.scope, filter: request.filters?.filter ?? "all", order: "publication-desc", keys }), "utf8").toString("base64url");
}
export function decodeCreatorCursor(value: string, request: CreatorWorkCountRequest): CursorKeys | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success && parsed.data.scope.creatorId === request.scope.creatorId && parsed.data.filter === (request.filters?.filter ?? "all")
      ? parsed.data.keys : null;
  } catch { return null; }
}

// Attribution restricts scope without adding presentation eligibility for designs/logos.
function eligibleCreatorWork(request: CreatorWorkCountRequest, now: Date) {
  const id = request.scope.creatorId;
  const filter = request.filters?.filter ?? "all";
  return sql`
    select 'post' as kind, ${creatorKindRank('post')}::int as kind_rank, ${posts.id} as id, ${posts.publishedAt} as published_at, ${posts.category} as filter
    from ${posts} where ${posts.creatorId} = ${id}::uuid and ${posts.status} = 'published' and ${posts.publishedAt} <= ${now}
      and ${filter === "all" || isPostCategory(filter)} and (${filter === "all"} or ${posts.category} = ${filter})
    union all
    select 'website', ${creatorKindRank('website')}::int, ${websites.id}, ${websites.publishedAt}, 'websites'
    from ${websites} where ${websites.creatorId} = ${id}::uuid and ${websites.status} = 'published' and ${websites.publishedAt} <= ${now}
      and (${completeWebsiteRecordingPredicate()}) and ${filter === "all" || filter === "websites"}
    union all
    select case when ${logos.kind} = 'icon' then 'icon' else 'logo' end,
      case when ${logos.kind} = 'icon' then ${creatorKindRank('icon')}::int else ${creatorKindRank('logo')}::int end, ${logos.id}, ${logos.publishedAt},
      case when ${logos.kind} = 'icon' then 'app-icons' else 'logos' end
    from ${logos} where ${logos.creatorId} = ${id}::uuid and ${logos.status} = 'published' and ${logos.publishedAt} <= ${now}
      and (${filter === "all"} or (${filter === "logos"} and ${logos.kind} = 'logo') or (${filter === "app-icons"} and ${logos.kind} = 'icon'))
  `;
}

// Schema-owned field names allow JSON relations in the same statement as selection.
function rowJson(table: PgTable): SQL {
  return sql`jsonb_build_object(${sql.join(Object.entries(getTableColumns(table)).flatMap(([key, column]) => [sql.raw("'" + key + "'"), sql`${column}`]), sql`, `)})`;
}
function mediaJson(table: typeof postMedia | typeof logoMedia | typeof websiteMedia, foreignKey: SQL, order: SQL) {
  return sql`coalesce((select jsonb_agg(${rowJson(table)} order by ${order}) from ${table} where ${foreignKey}), '[]'::jsonb)`;
}
function creatorJson(creatorId: SQL) {
  return sql`(select ${rowJson(creators)} from ${creators} where ${creators.id} = ${creatorId})`;
}
function cardProjection() {
  return sql`case
    when candidate.kind = 'post' then (select ${rowJson(posts)} || jsonb_build_object(
      'creator', ${creatorJson(sql`${posts.creatorId}`)},
      'media', ${mediaJson(postMedia, sql`${postMedia.postId} = ${posts.id}`, sql`${postMedia.position}`)}) from ${posts} where ${posts.id} = candidate.id)
    when candidate.kind = 'website' then (select ${rowJson(websites)} || jsonb_build_object(
      'creator', ${creatorJson(sql`${websites.creatorId}`)},
      'media', ${mediaJson(websiteMedia, sql`${websiteMedia.websiteId} = ${websites.id}`, sql`${websiteMedia.createdAt}`)},
      'sections', coalesce((select jsonb_agg(${rowJson(websiteSections)} order by ${websiteSections.position}) from ${websiteSections} where ${websiteSections.websiteId} = ${websites.id}), '[]'::jsonb)) from ${websites} where ${websites.id} = candidate.id)
    else (select ${rowJson(logos)} || jsonb_build_object(
      'creator', ${creatorJson(sql`${logos.creatorId}`)},
      'media', ${mediaJson(logoMedia, sql`${logoMedia.logoId} = ${logos.id}`, sql`${logoMedia.createdAt}`)}) from ${logos} where ${logos.id} = candidate.id)
    end`;
}
const dateSchema = z.union([z.string().min(1), z.date()]).pipe(z.coerce.date());
const presentationSchema = z.object({
  id: z.uuid(), creatorId: z.uuid(), status: z.literal("published"),
  publishedAt: dateSchema, createdAt: dateSchema,
  title: z.string(), slug: z.string(),
  creator: z.object({ name: z.string(), avatarUrl: z.string() }).passthrough(),
  media: z.array(z.object({ id: z.string(), url: z.string() }).passthrough()),
}).passthrough();
const candidateSchema = keysSchema.extend({ filter: filterSchema.exclude(["all"]), payload: z.unknown() });
function mapCandidate(value: unknown, request: CreatorWorkCountRequest, now: Date): { keys: CursorKeys; item: WorkCardData } {
  const candidate = candidateSchema.parse(value);
  const row = presentationSchema.parse(candidate.payload);
  if (row.id !== candidate.id || row.creatorId !== request.scope.creatorId || row.publishedAt > now || row.publishedAt.getTime() !== new Date(candidate.publishedAt).getTime()) {
    throw new Error("Creator work has inconsistent presentation or publication.");
  }
  const keys = keysSchema.parse({ id: candidate.id, kind: candidate.kind, publishedAt: candidate.publishedAt });
  if (candidate.kind === "website") {
    const websiteRow = row as unknown as Parameters<typeof mapPublishedWebsite>[0];
    if (!Array.isArray(websiteRow.sections) || !hasCompleteRecording(websiteRow)) throw new Error("Creator website has incomplete presentation.");
    const website = mapPublishedWebsite(websiteRow);
    return { keys, item: { id: website.id, kind: "website", category: "Websites", website } };
  }
  if (candidate.kind !== "post") {
    const logo = mapPublishedLogo(row as unknown as Parameters<typeof mapPublishedLogo>[0]);
    if ((logo.kind === "icon") !== (candidate.kind === "icon")) throw new Error("Creator logo has inconsistent kind.");
    return { keys, item: { id: logo.id, kind: "logo", category: "Logos", logo } };
  }
  if (!isPostCategory(candidate.filter) || row.category !== candidate.filter || !row.media[0]) throw new Error("Creator design has invalid category or missing cover media.");
  const post = mapPostCard({ ...row, mediaCount: row.media.length, media: row.media.slice(0, 1) } as unknown as Parameters<typeof mapPostCard>[0]);
  return { keys, item: { ...post, category: candidate.filter } };
}
function creatorCache() {
  cacheLife(PUBLIC_WORK_CACHE_LIFE);
  cacheTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG, PUBLISHED_POSTS_CACHE_TAG, PUBLISHED_LOGOS_CACHE_TAG, PUBLISHED_WEBSITES_CACHE_TAG);
}
export async function readCreatorPage(request: CreatorWorkPageRequest) {
  const cursor = request.cursor ? decodeCreatorCursor(request.cursor, request) : null;
  if (request.cursor && !cursor) throw new Error("Invalid creator-work cursor.");
  return cachedCreatorPage(request.scope.creatorId, request.filters?.filter ?? "all", cursor);
}
async function cachedCreatorPage(creatorId: string, filter: z.infer<typeof filterSchema>, cursor: CursorKeys | null) {
  "use cache";
  creatorCache();
  const request = { scope: { kind: "creator", creatorId }, filters: { filter } } as const;
  const database = requireDatabase();
  const now = evaluationTime();
  const continuation = cursor ? sql`where (published_at, kind_rank, id) < (${cursor.publishedAt}::timestamptz, ${creatorKindRank(cursor.kind)}, ${cursor.id}::uuid)` : sql``;
  const result = await database.execute(sql`
    with eligible as (${eligibleCreatorWork(request, now)}), candidate as (
      select * from eligible ${continuation} order by published_at desc, kind_rank desc, id desc limit 17
    ) select id, kind, filter,
      to_char(published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "publishedAt",
      ${cardProjection()} as payload
    from candidate order by published_at desc, kind_rank desc, id desc
  `);
  const mapped = result.rows.map(row => mapCandidate(row, request, now));
  const page = mapped.slice(0, 16);
  return { items: page.map(row => row.item), nextCursor: mapped.length > 16 ? encodeCreatorCursor(page[15].keys, request) : null };
}
export async function readCreatorCounts(request: CreatorWorkCountRequest): Promise<ProfileWorkCounts> {
  return cachedCreatorCounts(request.scope.creatorId, request.filters?.filter ?? "all");
}
async function cachedCreatorCounts(creatorId: string, filter: z.infer<typeof filterSchema>): Promise<ProfileWorkCounts> {
  "use cache";
  creatorCache();
  const now = evaluationTime();
  const result = await requireDatabase().execute(sql`with eligible as (${eligibleCreatorWork({ scope: { kind: "creator", creatorId }, filters: { filter } }, now)}) select filter, count(*)::int as count from eligible group by filter`);
  const filters: ProfileWorkCounts["filters"] = {};
  let total = 0;
  for (const value of result.rows) {
    const row = z.object({ filter: filterSchema.exclude(["all"]), count: z.number().int().nonnegative().safe() }).parse(value);
    if (filters[row.filter] !== undefined) throw new Error("Duplicate creator count filter.");
    filters[row.filter] = row.count;
    total += row.count;
  }
  return { total, filters };
}
export type WorkIdentity = { kind: "design" | "logo" | "website"; id: string };
export async function readCreatorIdentities(scope: z.infer<typeof creatorScopeSchema>): Promise<WorkIdentity[]> {
  const now = evaluationTime();
  const result = await requireDatabase().execute(sql`with eligible as (${eligibleCreatorWork({ scope }, now)})
    select distinct case when kind = 'post' then 'design' when kind = 'icon' then 'logo' else kind end as kind, id from eligible`);
  return z.array(z.strictObject({ kind: z.enum(["design", "logo", "website"]), id: z.uuid() })).parse(result.rows);
}
