import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { readPublicSitemap } from "@/data/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Keep XML request-time: static metadata regeneration can reject current-time
  // reads after invalidation. The underlying data still uses the tagged cache.
  await connection();
  return readPublicSitemap();
}
