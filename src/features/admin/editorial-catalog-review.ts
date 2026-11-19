import "server-only";
import { neon } from "@neondatabase/serverless";
import { assertCatalogSourceEnvironment, readCatalogEnrichment } from "@/features/inspora-catalog/source";
import { currentEnrichment, parseEnrichment, type EnrichmentEntry } from "../../../tools/inspora-mcp/enrichment.mjs";

/** Search notes from the catalog review (the private enrichment object), as seen by the MCP. */
export type CatalogReviewStatus = "review" | "review-stale";

const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000;
let cache: { at: number; entries: Promise<Map<string, EnrichmentEntry>> } | null = null;

function reviewEntries(): Promise<Map<string, EnrichmentEntry>> {
  if (cache && Date.now() - cache.at <= CACHE_MS) return cache.entries;
  const entries = readCatalogEnrichment().then(raw => new Map(parseEnrichment(raw).entries.map(entry => [entry.id, entry] as const)));
  cache = { at: Date.now(), entries };
  // A failed read is retried on the next page load rather than cached.
  entries.catch(() => { if (cache?.entries === entries) cache = null; });
  return entries;
}

async function lookup(workId: string): Promise<CatalogReviewStatus | null> {
  assertCatalogSourceEnvironment(process.env);
  const entry = (await reviewEntries()).get(workId);
  if (!entry) return null;
  // The same view and wire shape the MCP fingerprints, through the read-only catalog role.
  const sql = neon(process.env.INSPORA_CATALOG_SOURCE_DATABASE_URL!, { fetchOptions: { signal: AbortSignal.timeout(TIMEOUT_MS) } });
  const rows = await sql`SELECT * FROM public.inspora_mcp_public_catalog WHERE id = ${workId}`;
  const [row] = JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];
  if (!row) return null;
  return currentEnrichment(row, entry) ? "review" : "review-stale";
}

/**
 * Admin-only and best effort: null when the work has no catalog-review notes, or when the
 * lookup is unavailable (Preview, local, storage or database errors, or slower than 3 s).
 */
export async function catalogReviewStatus(workId: string): Promise<CatalogReviewStatus | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
  try {
    return await Promise.race([lookup(workId).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: forget the cached enrichment entries. */
export function resetCatalogReviewCache() { cache = null; }
