import { describe, expect, it } from "vitest";

import { parseAdminSponsorForm } from "./sponsor-validation";

function validSponsorForm() {
  const form = new FormData();
  form.set("title", "Mobbin");
  form.set("url", "https://mobbin.com/?ref=inspora");
  form.set("tagline", "UI/UX design reference library of top mobile & web apps.");
  form.set("mediaType", "image");
  form.set("mediaUrl", "/media/mobbin-banner.png");
  form.set("mediaWidth", "1200");
  form.set("mediaHeight", "800");
  form.set("mediaAlt", "Mobbin preview");
  form.set("iconUrl", "/media/mobbin-icon.png");
  form.set("isActive", "true");
  return form;
}

function withR2BaseUrl<T>(operation: () => T) {
  const previousBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = "https://pub-example.r2.dev";
  try {
    return operation();
  } finally {
    if (previousBaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
    else process.env.R2_PUBLIC_BASE_URL = previousBaseUrl;
  }
}

describe("admin sponsor validation", () => {
  it("parses and normalizes valid sponsor form", () => {
    const result = parseAdminSponsorForm(validSponsorForm());

    expect(result.title).toBe("Mobbin");
    expect(result.url).toBe("https://mobbin.com/?ref=inspora");
    expect(result.tagline).toBe("UI/UX design reference library of top mobile & web apps.");
    expect(result.mediaType).toBe("image");
    expect(result.mediaUrl).toBe("/media/mobbin-banner.png");
    expect(result.mediaWidth).toBe(1200);
    expect(result.mediaHeight).toBe(800);
    expect(result.iconUrl).toBe("/media/mobbin-icon.png");
    expect(result.isActive).toBe(true);
  });

  it("handles optional tagline, icon, and mediaUrl", () => {
    const form = validSponsorForm();
    form.delete("tagline");
    form.delete("iconUrl");
    form.delete("mediaUrl");
    const result = parseAdminSponsorForm(form);

    expect(result.tagline).toBeUndefined();
    expect(result.iconUrl).toBeUndefined();
    expect(result.mediaUrl).toBeUndefined();
    expect(result.mediaWidth).toBe(1200);
    expect(result.mediaHeight).toBe(800);
  });

  it("validates R2 storage keys when provider is r2", () => {
    const form = validSponsorForm();
    form.set("mediaUrl", "https://pub-example.r2.dev/sponsors/banner.webp");
    form.set("mediaStorageProvider", "r2");
    form.set("mediaStorageKey", "sponsors/banner.webp");

    withR2BaseUrl(() => {
      const result = parseAdminSponsorForm(form);
      expect(result.mediaStorageProvider).toBe("r2");
      expect(result.mediaStorageKey).toBe("sponsors/banner.webp");
    });
  });

  it("rejects invalid destination URLs", () => {
    const form = validSponsorForm();
    form.set("url", "not-a-valid-url");

    expect(() => parseAdminSponsorForm(form)).toThrow();
  });

  it("rejects blank titles", () => {
    const form = validSponsorForm();
    form.set("title", "   ");

    expect(() => parseAdminSponsorForm(form)).toThrow();
  });

  it("rejects zero or negative dimensions", () => {
    const form = validSponsorForm();
    form.set("mediaWidth", "0");

    expect(() => parseAdminSponsorForm(form)).toThrow();
  });
});
