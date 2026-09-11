import { afterEach, describe, expect, it } from "vitest";

import { parseAdminLogoForm } from "./logo-validation";

const previousR2BaseUrl = process.env.R2_PUBLIC_BASE_URL;

function validLogoForm() {
  const formData = new FormData();
  formData.set("slug", "paper-logo");
  formData.set("title", "Paper");
  formData.set("kind", "logo");
  formData.set("creatorId", "");
  formData.set("creatorName", "Nero Pursue");
  formData.set("creatorHandle", "");
  formData.set("creatorUrl", "https://example.com/nero");
  formData.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  formData.set("description", "A crisp geometric identity.");
  formData.set("industry", "SaaS");
  formData.set("colors", "Black, White");
  formData.set("styles", "Clean, Minimal");
  formData.set("shape", "Combination mark");
  formData.set("sourceUrl", "https://example.com/paper");
  formData.set("status", "published");
  formData.set(
    "media",
    JSON.stringify({
      url: "https://media.example.com/logos/paper.webp",
      storageProvider: "r2",
      storageKey: "logos/00000000-0000-4000-8000-000000000000.webp",
      mimeType: "image/webp",
      sourceMimeType: "image/png",
      sizeBytes: 1200,
      variants: [],
      alt: "Paper logo",
      width: 1080,
      height: 659,
    }),
  );
  return formData;
}

afterEach(() => {
  if (previousR2BaseUrl === undefined) {
    delete process.env.R2_PUBLIC_BASE_URL;
  } else {
    process.env.R2_PUBLIC_BASE_URL = previousR2BaseUrl;
  }
});

describe("admin logo validation", () => {
  it("parses a complete logo form", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const logo = parseAdminLogoForm(validLogoForm());

    expect(logo.kind).toBe("logo");
    expect(logo.colors).toEqual(["Black", "White"]);
    expect(logo.styles).toEqual(["Clean", "Minimal"]);
    expect(logo.media.storageKey).toMatch(/^logos\//);
  });

  it("requires a known logo kind", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const formData = validLogoForm();
    formData.set("kind", "animation");

    expect(() => parseAdminLogoForm(formData)).toThrow();
  });

  it("requires useful filter metadata", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const formData = validLogoForm();
    formData.set("colors", "");

    expect(() => parseAdminLogoForm(formData)).toThrow();
  });

  it("accepts legacy avatar URLs for read-only existing Preview creators", () => {
    const previousDataEnvironment = process.env.DATA_ENVIRONMENT;
    process.env.DATA_ENVIRONMENT = "preview";

    try {
      process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
      const formData = validLogoForm();
      formData.set("creatorId", "f97161eb-a54b-4f47-b30a-72334c03405d");
      formData.set(
        "creatorAvatarUrl",
        "https://legacy.example.com/creator-avatar.png",
      );

      expect(parseAdminLogoForm(formData).creator.id).toBe(
        "f97161eb-a54b-4f47-b30a-72334c03405d",
      );
    } finally {
      if (previousDataEnvironment === undefined) delete process.env.DATA_ENVIRONMENT;
      else process.env.DATA_ENVIRONMENT = previousDataEnvironment;
    }
  });
});
