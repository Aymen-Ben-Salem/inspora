import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { requireDatabase } from "@/db/client";
import { editorialBudgets as budgets, editorialGenerations as generations, posts, logos, websites } from "@/db/schema";
import { getDesignCategories } from "@/data/categories-repository";
import { editorialFields, type EditorialKind, type EditorialTaxonomy } from "./editorial-contract";
import { editorialSnapshot } from "./editorial-snapshot";
import { editorialCacheKey, requestEditorialProposal } from "./editorial-generation";
import { withEditorialLedger } from "./editorial-ledger";
import { assertEditorialBudget, editorialCost, EDITORIAL_PREVIEW_CAP_MICROS, EDITORIAL_PRODUCTION_CAP_MICROS, EDITORIAL_RESERVATION_MICROS as reserve, EDITORIAL_PREVIOUS_TEST_MICROS, EDITORIAL_TEST_LIMIT_MICROS } from "./editorial-budget";

const bodySchema = z.object({
  kind: z.enum(["design", "logo", "icon", "website"]),
  snapshot: z.object({ title: z.string().trim().min(1).max(200), sourceUrl: z.string().max(2000),
    current: z.record(z.string().max(30), z.string().max(4000)),
    media: z.array(z.object({ type: z.string().max(20), url: z.string().max(2000), posterUrl: z.string().max(2000), alt: z.string().max(500), width: z.number(), height: z.number() })).min(1).max(20),
  }),
  images: z.array(z.object({ dataUrl: z.string().max(600_000), frameSeconds: z.number().finite().nonnegative().nullable() })).min(1).max(6),
  regeneration: z.uuid().optional(),
});

const taxonomyFor = unstable_cache(async (kind: EditorialKind): Promise<EditorialTaxonomy> => {
  const db = requireDatabase();
  const rows = kind === "design" ? await db.select({ industries: posts.industries, styles: posts.styles, colors: posts.colors }).from(posts).where(eq(posts.status, "published"))
    : kind === "website" ? await db.select({ categories: websites.categories, themes: websites.themes, colors: websites.colors }).from(websites).where(eq(websites.status, "published"))
    : await db.select({ industry: logos.industry, styles: logos.styles, colors: logos.colors }).from(logos).where(and(eq(logos.status, "published"), eq(logos.kind, kind)));
  const result: EditorialTaxonomy = {};
  for (const field of editorialFields[kind]) {
    if (["description", "tagline"].includes(field)) continue;
    const values = rows.flatMap(row => {
      const value = (row as Record<string, unknown>)[field];
      return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    });
    result[field] = [...new Set(values as string[])].filter(Boolean).sort();
  }
  if (kind === "design") result.category = await getDesignCategories();
  return result;
}, ["editorial-taxonomy-v1"], { revalidate: 300 });

export async function generateEditorial(raw: unknown, actorId: string) {
  if (process.env.EDITORIAL_GENERATION_ENABLED !== "true" || !process.env.OPENAI_API_KEY) {
    throw new Error("Editorial generation is not configured yet.");
  }
  const request = bodySchema.parse(raw);
  const snapshot = editorialSnapshot(request.kind, { ...request.snapshot.current, ...request.snapshot,
    media: request.snapshot.media.map(m => ({ ...m, ...(request.kind === "website" ? { role: m.type } : {}) })) });
  const images: { dataUrl: string; sha256: string; frameSeconds: number | null }[] = [];
  for (const image of request.images) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)) throw new Error("Use JPEG visual samples.");
    const bytes = Buffer.from(image.dataUrl.split(",")[1], "base64");
    const meta = await sharp(bytes, { limitInputPixels: 1024 * 1024 }).metadata();
    if (meta.format !== "jpeg" || !meta.width || !meta.height || meta.width > 1024 || meta.height > 1024 || (meta.pages ?? 1) !== 1) {
      throw new Error("Visual samples must be still images within 1024 pixels.");
    }
    images.push({ ...image, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const input = { kind: request.kind, title: snapshot.title, context: `Source: ${snapshot.sourceUrl}. Evidence is sampled from uploaded media; no external page was read.`,
    current: snapshot.current, taxonomy: await taxonomyFor(request.kind),
    sourceVersion: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), images };
  if (Buffer.byteLength(JSON.stringify({ ...input, images: [] })) > 32000) throw new Error("Work context is too large. Shorten the current fields.");
  const environment = process.env.DATA_ENVIRONMENT ?? "unknown";
  const testing = environment === "development";
  if (!["development", "preview", "production"].includes(environment)) throw new Error("Editorial environment is not configured.");
  const period = testing ? "development-tests-20261113" : `${new Date().toISOString().slice(0, 7)}:${environment}`;
  const limit = testing ? EDITORIAL_TEST_LIMIT_MICROS : environment === "preview" ? EDITORIAL_PREVIEW_CAP_MICROS : EDITORIAL_PRODUCTION_CAP_MICROS;
  const cacheKey = createHash("sha256").update([actorId, environment, editorialCacheKey(input), request.regeneration ?? ""].join(":" )).digest("hex");
  const job = await withEditorialLedger(async tx => {
    // Short global lock protects overlapping months and concurrent cache misses.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(194816, 1)`);
    const expired = await tx.select().from(generations).where(and(eq(generations.state, "pending"), lt(generations.createdAt, new Date(Date.now() - 180000))));
    for (const stale of expired) {
      await tx.update(budgets).set({ spentMicros: sql`${budgets.spentMicros} + ${reserve}`, reservedMicros: sql`${budgets.reservedMicros} - ${reserve}` }).where(eq(budgets.period, stale.period));
      await tx.update(generations).set({ state: "unknown", costMicros: reserve }).where(eq(generations.id, stale.id));
    }
    const [cached] = await tx.select().from(generations).where(eq(generations.cacheKey, cacheKey));
    if (cached?.state === "ready") return cached;
    if (cached) throw new Error(cached.state === "pending" ? "This generation is already running." : "That attempt did not complete. Choose Regenerate to try again.");
    const active = await tx.select({ actor: generations.actorId }).from(generations).where(eq(generations.state, "pending"));
    if (active.length >= 2 || active.some(row => row.actor === actorId)) throw new Error("A generation is already running. Please wait before trying again.");
    await tx.insert(budgets).values({ period, spentMicros: testing ? EDITORIAL_PREVIOUS_TEST_MICROS : 0 }).onConflictDoNothing();
    const [budget] = await tx.select().from(budgets).where(eq(budgets.period, period)).for("update");
    assertEditorialBudget(budget.spentMicros, budget.reservedMicros, limit);
    await tx.update(budgets).set({ reservedMicros: budget.reservedMicros + reserve }).where(eq(budgets.period, period));
    const [created] = await tx.insert(generations).values({ id: randomUUID(), cacheKey, actorId, environment, period, state: "pending", snapshot, evidence: images.map(i => i.sha256) }).returning();
    return created;
  });
  if (job.state === "ready") return { id: job.id, proposal: job.proposal, cached: true, costUsd: (job.costMicros ?? 0) / 1e6 };
  let actualUsage: { input_tokens: number; output_tokens: number } | undefined;
  try {
    const result = await requestEditorialProposal(input, { apiKey: process.env.OPENAI_API_KEY!, onUsage: usage => { actualUsage = usage; } });
    await settle("ready", result.proposal);
    return { id: job.id, proposal: result.proposal, cached: false, costUsd: editorialCost(result.usage) / 1e6 };
  } catch (error) {
    await settle("failed");
    throw error;
  }
  async function settle(state: string, proposal?: Record<string, unknown>) {
    await withEditorialLedger(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(194816, 1)`);
      const [current] = await tx.select().from(generations).where(eq(generations.id, job.id)).for("update");
      if (current.state !== "pending") return;
      // Failed/ambiguous calls retain their full reservation unless usage is known.
      const cost = actualUsage ? editorialCost(actualUsage) : reserve;
      await tx.update(budgets).set({ spentMicros: sql`${budgets.spentMicros} + ${cost}`, reservedMicros: sql`${budgets.reservedMicros} - ${reserve}` }).where(eq(budgets.period, period));
      await tx.update(generations).set({ state, proposal: proposal ?? null, usage: actualUsage ?? null, costMicros: cost }).where(eq(generations.id, job.id));
    });
  }
}
