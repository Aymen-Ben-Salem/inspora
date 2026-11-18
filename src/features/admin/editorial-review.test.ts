import { beforeEach, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("./editorial-ledger", () => ({ withEditorialLedger: async (fn: (tx: unknown) => unknown) => fn({ select: () => ({ from: () => ({ where: async () => external.rows }) }) }) }));
import { prepareEditorialReview, refreshEditorialNotes, saveEditorialReview } from "./editorial-review";
import { editorialHashFromInput } from "./editorial-hash";
import { editorialSnapshot, stableSnapshot } from "./editorial-snapshot";
import { editorialContentHash } from "../../../tools/inspora-mcp/editorial-notes.mjs";
import { assertEditorialBudget, editorialCost, EDITORIAL_PREVIEW_CAP_MICROS, EDITORIAL_PRODUCTION_CAP_MICROS } from "./editorial-budget";

const id = "1c51893b-bc44-4d48-933b-e1402c74dc95";
const source = { title: "Studio", description: "Original", category: "Web", industries: ["Design"], colors: ["Black"], styles: ["Minimal"], sourceUrl: "https://example.com", media: [{ type: "image", url: "https://example.com/image.jpg", alt: "Studio", width: 1000, height: 800 }] };
const notes = { scope: "webpage" as const, visualNotes: "A studio hero uses spacious columns and monochrome imagery.", typography: "Large geometric sans-serif headings.", typographyIsSubject: false };
beforeEach(() => { external.rows = [{ id, snapshot: editorialSnapshot("design", source), evidence: ["a".repeat(64)], proposal: { fields: [{ field: "description", value: "Suggested", reason: "Visible layout" }], mediaAlt: [{ media: 0, value: "Studio hero with monochrome columns", reason: "Visible" }], hiddenNotes: notes, uncertainty: [] } }]; });
it("binds saved notes to the selected proposal and rejects subsequent edits", async () => {
  const input = { ...source, description: "Suggested", editorialReview: JSON.stringify({ id, selected: ["description"], notes: true }) };
  expect((await prepareEditorialReview("design", input, "admin"))?.notes).toEqual(notes);
  await expect(prepareEditorialReview("design", { ...input, title: "New title" }, "admin")).rejects.toThrow(/work changed/);
  await expect(prepareEditorialReview("design", { ...input, styles: ["Glass"] }, "admin")).rejects.toThrow(/work changed/);
  await expect(prepareEditorialReview("design", { ...input, media: [{ ...source.media[0], url: "https://example.com/new.jpg" }] }, "admin")).rejects.toThrow(/work changed/);
  expect(await prepareEditorialReview("design", source, "admin")).toBeNull();
  external.rows = [];
  await expect(prepareEditorialReview("design", input, "another-admin")).rejects.toThrow(/work changed/);
});
it("handles Postgres JSONB key order and saves notes in the work transaction", async () => {
  const row = external.rows[0] as { snapshot: unknown };
  row.snapshot = JSON.parse(stableSnapshot(row.snapshot));
  const input = { ...source, editorialReview: JSON.stringify({ id, selected: [], notes: true }) };
  const reviewed = await prepareEditorialReview("design", input, "admin");
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn((value: Record<string, unknown>) => (void value, { onConflictDoUpdate }));
  await saveEditorialReview({ insert: () => ({ values }) } as never, id, "design", input, "admin", reviewed);
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ workId: id, notes, reviewedBy: "admin" }));
  expect(values.mock.calls[0][0].contentHash).toBe(editorialContentHash({ ...source, kind: "design", source_url: source.sourceUrl }));
});
it("reserves before a call and keeps Preview and production allocations separate", () => {
  expect(EDITORIAL_PREVIEW_CAP_MICROS).toBe(5_000_000);
  expect(EDITORIAL_PRODUCTION_CAP_MICROS).toBe(65_000_000);
  expect(() => assertEditorialBudget(4_000_001, 0, EDITORIAL_PREVIEW_CAP_MICROS)).toThrow(/spending limit/);
  expect(() => assertEditorialBudget(3_000_000, 1_000_000, EDITORIAL_PREVIEW_CAP_MICROS)).not.toThrow();
  expect(() => assertEditorialBudget(3_000_001, 1_000_000, EDITORIAL_PREVIEW_CAP_MICROS)).toThrow();
  expect(editorialCost({ input_tokens: 1001, output_tokens: 100 })).toBe(3503);
});

it("applies selected alt text and accepts only the managed upload that replaced a private submission file", async () => {
  const withAlt = { ...source, media: [{ ...source.media[0], alt: "Studio hero with monochrome columns" }], editorialReview: JSON.stringify({ id, selected: [], alts: [0], notes: true }) };
  expect((await prepareEditorialReview("design", withAlt, "admin"))?.notes).toEqual(notes);
  await expect(prepareEditorialReview("design", { ...withAlt, media: source.media }, "admin")).rejects.toThrow(/work changed/);
  const href = "/api/submissions/1c51893b-bc44-4d48-933b-e1402c74dc95/media";
  const submitted = { ...source, media: [{ type: "image", url: href, alt: "Submitted design", width: 1, height: 1 }] };
  external.rows = [{ ...(external.rows[0] as object), snapshot: editorialSnapshot("design", submitted) }];
  const accepted = { ...submitted, media: [{ type: "image", url: "/uploads/accepted.webp", alt: "Submitted design", width: 1200, height: 900 }], editorialReview: JSON.stringify({ id, selected: [], notes: true }) };
  expect((await prepareEditorialReview("design", accepted, "admin", { submittedMediaHref: href }))?.notes).toEqual(notes);
  await expect(prepareEditorialReview("design", accepted, "admin")).rejects.toThrow(/work changed/);
  await expect(prepareEditorialReview("design", { ...accepted, media: [{ ...accepted.media[0], alt: "Edited" }] }, "admin", { submittedMediaHref: href })).rejects.toThrow(/work changed/);
});
it("keeps notes on hash-neutral edits, reports stale ones and audits replacements", async () => {
  const hash = editorialHashFromInput("design", source);
  const fake = (row: unknown) => {
    const inserted: unknown[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => (row ? [row] : []) }) }) }),
      insert: () => ({ values: (value: unknown) => { inserted.push(value); const done = Promise.resolve(); return Object.assign(done, { onConflictDoUpdate: async () => undefined }); } }),
    };
    return { inserted, tx };
  };
  expect(await refreshEditorialNotes(fake(null).tx as never, id, "design", source, "admin", null)).toBe("none");
  expect(await refreshEditorialNotes(fake({ kind: "design", contentHash: hash }).tx as never, id, "design", { ...source, slug: "renamed" }, "admin", null)).toBe("current");
  expect(await refreshEditorialNotes(fake({ kind: "design", contentHash: hash }).tx as never, id, "design", { ...source, description: "Edited" }, "admin", null)).toBe("stale");
  expect(await refreshEditorialNotes(fake({ kind: "logo", contentHash: hash }).tx as never, id, "design", source, "admin", null)).toBe("stale");
  const replaced = fake({ kind: "design", contentHash: "old", generationId: id, notes: {} });
  expect(await refreshEditorialNotes(replaced.tx as never, id, "design", source, "admin", { jobId: id, notes, evidence: [] })).toBe("current");
  expect(replaced.inserted).toHaveLength(2);
  expect(replaced.inserted[1]).toMatchObject({ action: "editorial_notes.replaced", resourceType: "post", details: { previousContentHash: "old" } });
});
it("hashes websites as the catalog view does, without full-page captures", () => {
  const website = { title: "Site", description: "D", tagline: "T", categories: ["Portfolio"], themes: [], colors: ["White"], sourceUrl: "https://example.com",
    media: [{ role: "recording", url: "/r.mp4", posterUrl: "/p.webp", alt: "R", width: 1440, height: 900 }, { role: "favicon", url: "/f.png", alt: "F", width: 32, height: 32 }] };
  const withCapture = { ...website, media: [...website.media, { role: "full_page", url: "/full.webp", alt: "", width: 1440, height: 9000 }] };
  expect(editorialHashFromInput("website", withCapture)).toBe(editorialHashFromInput("website", website));
  expect(editorialHashFromInput("website", website)).toBe(editorialContentHash({ ...website, kind: "website", source_url: website.sourceUrl,
    media: [{ type: "recording", url: "/r.mp4", poster: "/p.webp", alt: "R", width: 1440, height: 900 }, { type: "favicon", url: "/f.png", poster: null, alt: "F", width: 32, height: 32 }] }));
});
