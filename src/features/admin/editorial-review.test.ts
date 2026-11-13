import { beforeEach, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("./editorial-ledger", () => ({ withEditorialLedger: async (fn: (tx: unknown) => unknown) => fn({ select: () => ({ from: () => ({ where: async () => external.rows }) }) }) }));
import { prepareEditorialReview, saveEditorialReview } from "./editorial-review";
import { editorialSnapshot, stableSnapshot } from "./editorial-snapshot";
import { editorialContentHash } from "../../../tools/inspora-mcp/editorial-notes.mjs";
import { assertEditorialBudget, editorialCost, EDITORIAL_PREVIEW_CAP_MICROS, EDITORIAL_PRODUCTION_CAP_MICROS } from "./editorial-budget";

const id = "1c51893b-bc44-4d48-933b-e1402c74dc95";
const source = { title: "Studio", description: "Original", category: "Web", industries: ["Design"], colors: ["Black"], styles: ["Minimal"], sourceUrl: "https://example.com", media: [{ type: "image", url: "https://example.com/image.jpg", alt: "Studio", width: 1000, height: 800 }] };
const notes = { scope: "webpage", visualNotes: "A studio hero uses spacious columns and monochrome imagery.", typography: "Large geometric sans-serif headings.", typographyIsSubject: false };
beforeEach(() => { external.rows = [{ id, snapshot: editorialSnapshot("design", source), evidence: ["a".repeat(64)], proposal: { fields: [{ field: "description", value: "Suggested", reason: "Visible layout" }], hiddenNotes: notes, uncertainty: [] } }]; });
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
  const values = vi.fn().mockResolvedValue(undefined);
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
