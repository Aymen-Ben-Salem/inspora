import { afterEach, describe, expect, it, vi } from "vitest";

import {
  creatorUsernameCandidates,
  normalizeCreatorUsername,
  normalizeXProfileUrl,
  parseAdminCreatorForm,
  validateAdminCreatorInput,
  validateCreatorUsername,
} from "./validation";
import { profileEditSchema } from "../profiles/validation";

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
  it.each([
    "https://x.com/Studio_One",
    "http://twitter.com/Studio_One/",
    "https://WWW.X.COM/Studio_One?s=21",
    "https://mobile.twitter.com/Studio_One/status/123",
    "https://x.com./Studio_One",
    "https://x.com",
    "ftp://twitter.com/Studio_One",
  ])("rejects X URLs only from the Website field: %s", (url) => {
    const form = validCreatorForm();
    form.set("creatorUrl", url);
    expect(() => parseAdminCreatorForm(form)).toThrow("Put your X profile in the X field.");
    expect(() => validateAdminCreatorInput({
      name: "Example Studio", avatarUrl: "/brand/default-avatar.svg", url,
    })).toThrow("Put your X profile in the X field.");
    const result = profileEditSchema.safeParse({ websiteUrl: url });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({
      path: ["websiteUrl"], message: "Put your X profile in the X field.",
    });
  });

  it.each([
    "https://portfolio.example/work",
    "http://portfolio.example",
    "https://github.com/studio",
    "https://x.com.example.org/studio",
    "https://twitter.com.example.org/studio",
    "https://example.org/?next=https://x.com/studio",
  ])("keeps other Website URLs accepted: %s", (url) => {
    expect(validateAdminCreatorInput({
      name: "Example Studio", avatarUrl: "/brand/default-avatar.svg", url,
    }).url).toBe(url);
    expect(profileEditSchema.safeParse({ websiteUrl: url }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)", "data:text/html,example", "ftp://portfolio.example",
    "https://user:pass@portfolio.example",
  ])("preserves existing admin URL rules outside X: %s", (url) => {
    expect(validateAdminCreatorInput({
      name: "Example Studio", avatarUrl: "/brand/default-avatar.svg", url,
    }).url).toBe(url);
    expect(profileEditSchema.safeParse({ websiteUrl: url }).success).toBe(false);
  });

  it("still accepts X in its dedicated field and allows clearing Website", () => {
    const form = validCreatorForm();
    form.set("creatorXProfileUrl", "https://x.com/studio_one");
    expect(parseAdminCreatorForm(form)).toMatchObject({ url: undefined, xProfileUrl: "https://x.com/studio_one" });
    expect(profileEditSchema.parse({ websiteUrl: "" }).websiteUrl).toBeNull();
    expect(profileEditSchema.parse({ websiteUrl: null }).websiteUrl).toBeNull();
  });

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
    "//avatars.example.net/studio.png",
    "/\\avatars.example.net/studio.png",
    "/brand\\avatar.png",
  ])(
    "rejects unsupported creator avatar %s",
    (avatarUrl) => {
      const form = validCreatorForm();
      form.set("creatorAvatarUrl", avatarUrl);
      expect(() => parseAdminCreatorForm(form)).toThrow("Use a local path or an https URL");
      expect(() => validateAdminCreatorInput({
        name: "Example Studio",
        avatarUrl,
      })).toThrow("Use a local path or an https URL");
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
    [" @DawoodUI ", "DawoodUI"],
    ["__Studio__", "__Studio__"],
    ["X", "X"],
    ["Crème brûlée", "creme_brulee"],
  ])("normalizes %s into a profile username", (input, expected) => {
    expect(normalizeCreatorUsername(input)).toBe(expected);
  });

  it("enforces the approved username format and reserved routes", () => {
    expect(validateCreatorUsername("valid_name")).toEqual({ ok: true });
    expect(validateCreatorUsername("ab")).toEqual({ ok: true });
    expect(validateCreatorUsername("DawoodUI")).toEqual({ ok: true });
    expect(validateCreatorUsername("invalid.name")).toEqual({
      ok: false,
      message: "Use 1-30 letters, numbers, or underscores.",
    });
    expect(validateCreatorUsername("AdMiN")).toEqual({
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
