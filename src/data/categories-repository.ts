import "server-only";

import { asc } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDatabase } from "@/db/client";
import { designCategories } from "@/db/schema";
import { POST_CATEGORIES } from "@/domain/post";

export const DESIGN_CATEGORIES_CACHE_TAG = "design-categories";

export async function getDesignCategories(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(DESIGN_CATEGORIES_CACHE_TAG);
  const database = getDatabase();
  if (!database) return [...POST_CATEGORIES];
  const rows = await database.select({ name: designCategories.name })
    .from(designCategories).orderBy(asc(designCategories.name));
  const names = new Set(rows.map((row) => row.name));
  return [...POST_CATEGORIES.filter((name) => names.has(name)),
    ...rows.map((row) => row.name).filter((name) => !POST_CATEGORIES.some((initial) => initial === name))];
}
