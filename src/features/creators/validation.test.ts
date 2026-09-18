import { describe, expect, it } from "vitest";

import {
  creatorUsernameCandidates,
  normalizeCreatorUsername,
  normalizeXProfileUrl,
  validateCreatorUsername,
} from "./validation";

describe("creator validation", () => {
  it.each([
    [" Studio North ", "studio_north"],
    ["@NERO.PURSUE", "nero_pursue"],
    ["Crème brûlée", "creme_brulee"],
  ])("normalizes %s into a profile username", (input, expected) => {
    expect(normalizeCreatorUsername(input)).toBe(expected);
  });

  it("enforces the approved username format and reserved routes", () => {
    expect(validateCreatorUsername("valid_name")).toEqual({ ok: true });
    expect(validateCreatorUsername("ab")).toEqual({
      ok: false,
      message: "Use 3-30 lowercase letters, numbers, or underscores.",
    });
    expect(validateCreatorUsername("admin")).toEqual({
      ok: false,
      message: "That username is reserved.",
    });
  });

  it("generates deterministic collision candidates without exceeding 30 chars", () => {
    expect(creatorUsernameCandidates("A Very Long Studio Name With Extras").slice(0, 3))
      .toEqual([
        "a_very_long_studio_name_with_e",
        "a_very_long_studio_name_with_2",
        "a_very_long_studio_name_with_3",
      ]);
  });

  it.each([
    ["https://x.com/NeroPursue?s=11", "https://x.com/neropursue"],
    ["https://twitter.com/NeroPursue/status/123", "https://x.com/neropursue"],
  ])("normalizes an X profile URL from %s", (input, expected) => {
    expect(normalizeXProfileUrl(input)).toBe(expected);
  });

  it.each([
    "https://example.com/name",
    "https://x.com/home",
    "https://x.com/name/with-extra",
    "javascript:alert(1)",
  ])("rejects invalid X profile URL %s", (input) => {
    expect(() => normalizeXProfileUrl(input)).toThrow("valid X profile URL");
  });
});
