import { afterEach, describe, expect, it } from "vitest";

import { parseAdminWebsiteForm } from "./website-validation";

const previousR2BaseUrl = process.env.R2_PUBLIC_BASE_URL;

function validWebsiteForm() {
  const formData = new FormData();
  formData.set("slug", "paper-site");
  formData.set("title", "Paper");
  formData.set("tagline", "A calmer way to plan work.");
  formData.set("creatorId", "");
  formData.set("creatorName", "Nero Pursue");
  formData.set("creatorHandle", "");
  formData.set("creatorUrl", "https://example.com/nero");
  formData.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  formData.set("description", "A precise product marketing website.");
  formData.set("categories", "SaaS, Productivity");
  formData.set("themes", "Light, Editorial");
  formData.set("colors", "White, Blue");
  formData.set("sourceUrl", "https://example.com/paper");
  formData.set("status", "published");
  formData.set("media", JSON.stringify([
    {
      role: "full_page",
      url: "https://media.example.com/websites/paper.webp",
      storageProvider: "r2",
      storageKey: "websites/00000000-0000-4000-8000-000000000000.webp",
      mimeType: "image/webp",
      alt: "Paper website",
      width: 1440,
      height: 9000,
    },
    {
      role: "favicon",
      url: "https://media.example.com/websites/paper-icon.webp",
      storageProvider: "r2",
      storageKey: "websites/00000000-0000-4000-8000-000000000001.webp",
      mimeType: "image/webp",
      alt: "Paper icon",
      width: 64,
      height: 64,
    },
  ]));
  formData.set("sections", JSON.stringify([
    { label: "Hero", top: 0, height: 900, position: 0 },
    { label: "Features", top: 900, height: 1200, position: 1 },
  ]));
  return formData;
}

afterEach(() => {
  if (previousR2BaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = previousR2BaseUrl;
});

describe("admin website validation", () => {
  it("parses one screenshot into ordered crop regions", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const website = parseAdminWebsiteForm(validWebsiteForm());

    expect(website.media.map((media) => media.role)).toEqual(["full_page", "favicon"]);
    expect(website.sections[0]).toEqual({
      label: "Hero",
      top: 0,
      height: 900,
      position: 0,
    });
  });

  it("rejects a crop outside the full screenshot", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const formData = validWebsiteForm();
    formData.set("sections", JSON.stringify([
      { label: "Footer", top: 8500, height: 1000, position: 0 },
    ]));

    expect(() => parseAdminWebsiteForm(formData)).toThrow();
  });
});
