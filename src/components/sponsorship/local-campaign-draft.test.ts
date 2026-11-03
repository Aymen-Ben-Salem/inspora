// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { draftMatchesOwner, validateLocalFile, type LocalCampaignDraft } from "./local-campaign-draft";
const draft = {
  ownerUserId: null, contact: { email: "owner@example.com" }, expiresAt: 1500,
} as LocalCampaignDraft;
it("restores an anonymous draft only to its verified email, within its expiry", () => {
  expect(draftMatchesOwner(draft, "owner", "Owner@example.com", 1000)).toBe(true);
  expect(draftMatchesOwner(draft, "another", "other@example.com", 1000)).toBe(false);
  expect(draftMatchesOwner(draft, "owner", "owner@example.com", 1500)).toBe(false);
  expect(draftMatchesOwner({ ...draft, expiresAt: 1e12 }, "owner", "owner@example.com", 1000)).toBe(false);
});
it("does not transfer an identified owner's draft even when another account has the same email", () => {
  expect(draftMatchesOwner({ ...draft, ownerUserId: "original" }, "other", "owner@example.com", 1000)).toBe(false);
});
it("validates local files before persisting them", () => {
  expect(() => validateLocalFile(new File(["a"], "icon.png", { type: "image/png" }), "icon")).not.toThrow();
  expect(() => validateLocalFile(new File(["a"], "script.svg", { type: "image/svg+xml" }), "icon")).toThrow();
  expect(() => validateLocalFile(new File(["a"], "movie.mp4", { type: "video/mp4" }), "wordmark")).toThrow();
  expect(() => validateLocalFile({ type: "image/png", size: 11 * 1024 * 1024 } as File, "icon")).toThrow();
});
