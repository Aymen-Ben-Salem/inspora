import { expect, it } from "vitest";
import { campaignRuns } from "./campaign-runs";
import { DEFAULT_PROMO_LABEL, promoLabelSchema, publicPromoLabel } from "./promo-label";

it("normalizes a promotional label", () => {
  expect(promoLabelSchema.parse({ ...DEFAULT_PROMO_LABEL, text: "  20% OFF Black Friday ", textColor: "#BE185D" }))
    .toEqual({ ...DEFAULT_PROMO_LABEL, text: "20% OFF Black Friday", textColor: "#be185d" });
});

it("rejects unsafe colours, long text and an enabled label without text", () => {
  for (const label of [
    { ...DEFAULT_PROMO_LABEL, backgroundColor: "red; display:none" },
    { ...DEFAULT_PROMO_LABEL, text: "x".repeat(33) },
    { ...DEFAULT_PROMO_LABEL, text: "   " },
    { ...DEFAULT_PROMO_LABEL, icon: "zap" },
  ]) expect(promoLabelSchema.safeParse(label).success).toBe(false);
  // A switched-off label keeps its settings, even blank text, for later.
  expect(promoLabelSchema.safeParse({ ...DEFAULT_PROMO_LABEL, enabled: false, text: "" }).success).toBe(true);
});

it("publishes only enabled, valid labels", () => {
  expect(publicPromoLabel(DEFAULT_PROMO_LABEL)).toEqual({ text: "20% OFF Black Friday", textColor: "#be185d", backgroundColor: "#fcecf6", borderColor: "#f6cfe3" });
  expect(publicPromoLabel({ ...DEFAULT_PROMO_LABEL, enabled: false })).toBeUndefined();
  expect(publicPromoLabel({ ...DEFAULT_PROMO_LABEL, textColor: "url(x)" })).toBeUndefined();
  expect(publicPromoLabel(null)).toBeUndefined();
});

it("merges version saves into one campaign run and keeps separate runs, newest first", () => {
  const at = (value: string) => new Date(value);
  expect(campaignRuns([
    { campaignId: "a", startAt: at("2026-11-01T10:00:00Z"), endAt: at("2026-11-03T09:00:00.000Z") },
    { campaignId: "a", startAt: at("2026-11-03T09:00:00.004Z"), endAt: at("2026-11-05T12:00:00Z") },
    { campaignId: "b", startAt: at("2026-11-05T12:00:00.002Z"), endAt: at("2026-11-08T00:00:00Z") },
    { campaignId: "a", startAt: at("2026-11-10T00:00:00Z"), endAt: null },
  ])).toEqual([
    { campaignId: "a", start: "2026-11-10T00:00:00.000Z", end: null },
    { campaignId: "b", start: "2026-11-05T12:00:00.002Z", end: "2026-11-08T00:00:00.000Z" },
    { campaignId: "a", start: "2026-11-01T10:00:00.000Z", end: "2026-11-05T12:00:00.000Z" },
  ]);
});
