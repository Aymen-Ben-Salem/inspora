import "server-only";

import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth/require-admin";
import { requireDatabase } from "@/db/client";
import { creators, logos, posts, websites } from "@/db/schema";
import type { ImageVariant } from "@/storage/types";
import { ADMIN_LIBRARY_PAGE_SIZE } from "./library-pagination";
import { adminThumbnailUrl } from "./thumbnail";
import type { AdminCreatorWork, AdminCreatorWorkPage } from "./creator-work-types";

const inputSchema = z.object({
  creatorId: z.uuid(),
  query: z.string().trim().max(100).default(""),
  cursor: z.string().min(1).max(1024).nullish(),
});
const cursorSchema = z.strictObject({
  v: z.literal(1),
  creatorId: z.uuid(),
  query: z.string().max(100),
  keys: z.strictObject({ createdAt: z.iso.datetime(), rank: z.int().min(1).max(3), id: z.uuid() }),
});
type WorkRow = Omit<AdminCreatorWork, "thumbnailUrl" | "thumbnailAlt"> & {
  previewUrl: string | null;
  previewAlt: string | null;
  variants: ImageVariant[];
};

export class InvalidAdminCreatorWorkQueryError extends Error {
  constructor() { super("Invalid creator-work request."); }
}

function decodeCursor(value: string, creatorId: string, query: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (parsed.creatorId !== creatorId || parsed.query !== query) throw new Error();
    return parsed.keys;
  } catch { throw new InvalidAdminCreatorWorkQueryError(); }
}

export async function getAdminCreatorWorkPage(input: {
  creatorId: string; query?: string; cursor?: string | null;
}): Promise<AdminCreatorWorkPage> {
  await requireAdmin();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new InvalidAdminCreatorWorkQueryError();
  const { creatorId, query, cursor: cursorValue } = parsed.data;
  const cursor = cursorValue ? decodeCursor(cursorValue, creatorId, query) : null;
  const needle = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const matches = (table: typeof posts | typeof logos | typeof websites) => and(
    sql`${table.creatorId} in (select id from creator_scope)`,
    query ? or(ilike(table.title, needle), ilike(table.slug, needle)) : undefined,
  );
  const continuation = cursor
    ? sql`where (created_at, kind_rank, id) < (${cursor.createdAt}::timestamptz, ${cursor.rank}, ${cursor.id}::uuid)`
    : sql``;
  // Select a small cross-kind page before looking up its cover media. This is
  // admin attribution scope, so drafts and archived work remain visible.
  const result = await requireDatabase().execute<WorkRow>(sql`
    with creator_scope as (
      select ${creators.id} as id from ${creators}
      where ${eq(creators.id, creatorId)}
      ${process.env.DATA_ENVIRONMENT === "development" ? sql`` : sql`and (${creators.handle} is null or lower(trim(${creators.handle})) not like 'dev-%')`}
    ), work as (
      select ${posts.id} as id, 'design'::text as kind, 3 as kind_rank,
        ${posts.title} as title, ${posts.status} as status, ${posts.createdAt} as created_at
      from ${posts} where ${matches(posts)}
      union all
      select ${logos.id}, case when ${logos.kind} = 'icon' then 'app-icon' else 'logo' end, 2,
        ${logos.title}, ${logos.status}, ${logos.createdAt}
      from ${logos} where ${matches(logos)}
      union all
      select ${websites.id}, 'website', 1, ${websites.title}, ${websites.status}, ${websites.createdAt}
      from ${websites} where ${matches(websites)}
    ), page as (
      select * from work ${continuation}
      order by created_at desc, kind_rank desc, id desc limit ${ADMIN_LIBRARY_PAGE_SIZE + 1}
    )
    select page.id, page.kind, page.title, page.status,
      to_char(page.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
      case when page.kind = 'design' then case when pm.type = 'video' then pm.poster_url else pm.url end
        when page.kind in ('logo', 'app-icon') then lm.url else wm.poster_url end as "previewUrl",
      coalesce(pm.alt, lm.alt, wm.alt, page.title) as "previewAlt",
      case when page.kind = 'design' and pm.type = 'image' then coalesce(pm.variants, '[]'::jsonb)
        when page.kind in ('logo', 'app-icon') then coalesce(lm.variants, '[]'::jsonb)
        else '[]'::jsonb end as variants
    from page
    left join lateral (
      select type, url, poster_url, alt, variants from post_media
      where post_id = page.id and page.kind = 'design' order by position limit 1
    ) pm on true
    left join lateral (
      select url, alt, variants from logo_media
      where logo_id = page.id and page.kind in ('logo', 'app-icon') limit 1
    ) lm on true
    left join lateral (
      select poster_url, alt from website_media
      where website_id = page.id and page.kind = 'website' and role = 'recording' limit 1
    ) wm on true
    order by page.created_at desc, page.kind_rank desc, page.id desc
  `);
  const rows = result.rows.slice(0, ADMIN_LIBRARY_PAGE_SIZE);
  const last = rows[rows.length - 1];
  const nextCursor = result.rows.length > ADMIN_LIBRARY_PAGE_SIZE && last
    ? Buffer.from(JSON.stringify({ v: 1, creatorId, query, keys: {
      createdAt: last.createdAt, rank: last.kind === "design" ? 3 : last.kind === "website" ? 1 : 2, id: last.id,
    } }), "utf8").toString("base64url")
    : null;
  return {
    items: rows.map(({ previewUrl, previewAlt, variants, ...row }) => ({
      ...row,
      thumbnailUrl: previewUrl ? adminThumbnailUrl(previewUrl, variants) : null,
      thumbnailAlt: previewAlt || row.title,
    })),
    nextCursor,
  };
}
