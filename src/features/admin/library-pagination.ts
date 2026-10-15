import "server-only";

import { count, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { logos, posts, websites } from "@/db/schema";
import type { PostView } from "@/domain/post";
export { adminThumbnailUrl } from "./thumbnail";

export const ADMIN_LIBRARY_PAGE_SIZE = 24;
export type AdminLibraryOptions = { page?: number; view?: PostView };

export function parseAdminPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function adminPageBounds(total: number, requested = 1, pageSize = ADMIN_LIBRARY_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, totalPages) : 1;
  return { page, totalPages };
}

// One aggregate returns library-wide totals without transferring the library.
export async function getAdminLibraryPagination(
  database: Database,
  table: typeof posts | typeof logos | typeof websites,
  { page = 1, view = "latest" }: AdminLibraryOptions,
) {
  const [summary] = await database.select({
    total: count(),
    published: sql<number>`count(*) filter (where ${table.status} = 'published')`.mapWith(Number),
    draft: sql<number>`count(*) filter (where ${table.status} = 'draft')`.mapWith(Number),
    archived: sql<number>`count(*) filter (where ${table.status} = 'archived')`.mapWith(Number),
    featured: "isFeatured" in table
      ? sql<number>`count(*) filter (where ${table.isFeatured} = true)`.mapWith(Number)
      : sql<number>`0`.mapWith(Number),
  }).from(table);
  const counts = summary ?? { total: 0, published: 0, draft: 0, archived: 0, featured: 0 };
  return { counts, ...adminPageBounds(view === "featured" ? counts.featured : counts.total, page) };
}
