import { afterEach, describe, expect, it, vi } from "vitest";

import {
  creatorUsernameCandidates,
  normalizeCreatorUsername,
  normalizeXProfileUrl,
  parseAdminCreatorForm,
  validateAdminCreatorInput,
  validateCreatorUsername,
} from "./validation";

afterEach(() => vi.unstubAllEnvs());

function validCreatorForm() {
  const form = new FormData();
  form.set("creatorId", "");
  form.set("creatorName", "Example Studio");
  form.set("creatorUrl", "");
  form.set("creatorXProfileUrl", "");
  form.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  return form;
}

describe("creator validation", () => {
  it("accepts a pasted external HTTPS creator avatar", () => {
    const form = validCreatorForm();
    form.set("creatorAvatarUrl", "https://avatars.example.net/studio.png");

    expect(parseAdminCreatorForm(form).avatarUrl).toBe(
      "https://avatars.example.net/studio.png",
    );
  });

  it("accepts an external avatar when revalidating the creator identity input", () => {
    expect(validateAdminCreatorInput({
      name: "Example Studio",
      avatarUrl: "https://avatars.example.net/studio.png",
    }).avatarUrl).toBe("https://avatars.example.net/studio.png");
  });

  it.each([
    "",
    "not-a-url",
    "http://avatars.example.net/studio.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
  ])(
    "rejects unsupported creator avatar %s",
    (avatarUrl) => {
      const form = validCreatorForm();
      form.set("creatorAvatarUrl", avatarUrl);
      expect(() => parseAdminCreatorForm(form)).toThrow("Use a local path or an https URL");
    },
  );

  it("keeps local avatars and managed avatar ownership metadata intact", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example.com");
    const form = validCreatorForm();
    expect(parseAdminCreatorForm(form).avatarUrl).toBe("/brand/default-avatar.svg");
    form.set("creatorAvatarUrl", "https://media.example.com/creators/studio.webp");
    form.set("creatorAvatarStorageProvider", "r2");
    form.set("creatorAvatarStorageKey", "creators/studio.webp");

    expect(parseAdminCreatorForm(form)).toMatchObject({
      avatarStorageProvider: "r2",
      avatarStorageKey: "creators/studio.webp",
    });
    form.delete("creatorAvatarStorageKey");
    expect(() => parseAdminCreatorForm(form)).toThrow(
      "Managed creator avatars must include their storage provider and key.",
    );
  });

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
