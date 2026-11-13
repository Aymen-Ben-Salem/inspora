import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("./editorial-ledger", async () => ({ withEditorialLedger: (await import("@/db/write-client")).withWriteTransaction }));
const provider = vi.hoisted(() => vi.fn());
vi.mock("./editorial-generation", async importOriginal => ({ ...await importOriginal<object>(), requestEditorialProposal: provider }));
import { generateEditorial } from "./editorial-service";
import { editorialBudgets, editorialGenerations } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { loadPreviewEnvironment } from "../../../scripts/lib/preview-environment";

it.skipIf(process.env.EDITORIAL_DATABASE_TEST !== "1")("serializes concurrent calls, reuses ready proposals, accounts rejected outputs and stops at the cap", async () => {
  loadPreviewEnvironment(); // Explicit approved Preview fingerprint before any write.
  for (const [key, value] of Object.entries(parse(readFileSync(".env.preview.local")))) vi.stubEnv(key, value);
  vi.stubEnv("EDITORIAL_GENERATION_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "mock-only");
  const actor = `editorial-integration-${randomUUID()}`, period = `${new Date().toISOString().slice(0, 7)}:preview`;
  const existing = await withWriteTransaction(tx => tx.select().from(editorialBudgets).where(eq(editorialBudgets.period, period)));
  if (existing.length) throw new Error("Integration test requires an unused Preview ledger; never overwrite existing usage.");
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "black" } }).jpeg().toBuffer();
  const input = { kind: "design", snapshot: { title: "Editorial test", sourceUrl: "https://example.com", current: { description: "Original", category: "Web", industries: "", styles: "", colors: "" }, media: [{ type: "image", url: "https://example.com/test.jpg", posterUrl: "", alt: "", width: 8, height: 8 }] }, images: [{ dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`, frameSeconds: null }] };
  const proposal = { fields: [{ field: "description", value: "Test suggestion", reason: "Fixture" }], hiddenNotes: { scope: "component", visualNotes: "A small black image is used only as test evidence.", typography: null, typographyIsSubject: false }, uncertainty: [] };
  provider.mockImplementation(async (_input, options) => { await new Promise(resolve => setTimeout(resolve, 300)); const usage = { input_tokens: 100, output_tokens: 50 }; options.onUsage(usage); return { proposal, usage }; });
  try {
    const results = await Promise.allSettled([generateEditorial(input, actor), generateEditorial(input, actor)]);
    if (results.every(r => r.status === "rejected")) throw new Error(results.map(r => r.status === "rejected" ? String(r.reason?.message).replace(/postgres(?:ql)?:\/\/\S+/g, "[connection]").slice(0, 180) : "").join("; "));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await generateEditorial(input, actor)).cached).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    const [budget] = await withWriteTransaction(tx => tx.select().from(editorialBudgets).where(eq(editorialBudgets.period, period)));
    expect(budget).toMatchObject({ spentMicros: 750, reservedMicros: 0 });
    provider.mockImplementation(async (_input, options) => { options.onUsage({ input_tokens: 100, output_tokens: 50 }); throw new Error("Invalid model output"); });
    await expect(generateEditorial({ ...input, regeneration: randomUUID() }, actor)).rejects.toThrow("Invalid model output");
    const [failedBudget] = await withWriteTransaction(tx => tx.select().from(editorialBudgets).where(eq(editorialBudgets.period, period)));
    expect(failedBudget).toMatchObject({ spentMicros: 1500, reservedMicros: 0 });
    await withWriteTransaction(tx => tx.update(editorialBudgets).set({ spentMicros: 5_000_000 }).where(eq(editorialBudgets.period, period)));
    await expect(generateEditorial({ ...input, regeneration: randomUUID() }, actor)).rejects.toThrow(/spending limit/);
    expect(provider).toHaveBeenCalledTimes(2);
  } finally {
    await withWriteTransaction(async tx => {
      await tx.delete(editorialGenerations).where(and(eq(editorialGenerations.actorId, actor), eq(editorialGenerations.environment, "preview")));
      const remaining = await tx.select({ id: editorialGenerations.id }).from(editorialGenerations).where(eq(editorialGenerations.period, period));
      if (!remaining.length) await tx.delete(editorialBudgets).where(eq(editorialBudgets.period, period));
    });
    vi.unstubAllEnvs();
  }
}, 60000);
