import { afterEach, describe, expect, it } from "vitest";

import { parseAdminWebsiteForm } from "./website-validation";

const previousR2BaseUrl = process.env.R2_PUBLIC_BASE_URL;
const base = "https://media.example.com/websites";

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
      role: "recording",
      url: `${base}/paper.webm`,
      posterUrl: `${base}/paper-poster.webp`,
      storageProvider: "r2",
      storageKey: "websites/00000000-0000-4000-8000-000000000000.webm",
      mimeType: "video/webm",
      sizeBytes: 20_000_000,
      videoPreview: {
        url: `${base}/paper-preview.mp4`,
        storageKey: "websites/00000000-0000-4000-8000-000000000001.mp4",
        width: 1080,
        height: 1920,
        bytes: 10_000_000,
        format: "mp4",
      },
      posterStorageKey: "websites/00000000-0000-4000-8000-000000000002.webp",
      alt: "Paper website recording",
      width: 1080,
      height: 1920,
    },
    {
      role: "favicon",
      url: `${base}/paper-icon.webp`,
      storageProvider: "r2",
      storageKey: "websites/00000000-0000-4000-8000-000000000003.webp",
      mimeType: "image/webp",
      alt: "Paper icon",
      width: 64,
      height: 64,
    },
  ]));
  return formData;
}

afterEach(() => {
  if (previousR2BaseUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = previousR2BaseUrl;
});

describe("admin website validation", () => {
  it("accepts a pasted external HTTPS favicon without upload metadata", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const form = validWebsiteForm();
    const url = "https://cdn.dribbble.com/favicon.jpg";
    const media = JSON.parse(String(form.get("media")));
    media[1] = { role: "favicon", url, alt: "Paper icon", width: 160, height: 160 };
    form.set("media", JSON.stringify(media));
    const image = parseAdminWebsiteForm(form).media[1];
    expect(image.url).toBe(url);
    expect(image.storageProvider).toBeUndefined();
    expect(image.storageKey).toBeUndefined();
  });

  it("accepts a pasted external HTTPS creator avatar", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const form = validWebsiteForm();
    form.set("creatorAvatarUrl", "https://avatars.example.net/studio.png");

    expect(parseAdminWebsiteForm(form).creator.avatarUrl).toBe(
      "https://avatars.example.net/studio.png",
    );
  });

  it("keeps managed website media restricted to configured hosts", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const form = validWebsiteForm();
    const media = JSON.parse(String(form.get("media")));
    media[0].url = "https://artwork.example.net/recording.webm";
    form.set("media", JSON.stringify(media));

    expect(() => parseAdminWebsiteForm(form)).toThrow(
      "Use a local path or an https URL from the configured media hostname.",
    );

  });

  it("preserves complete avatar ownership metadata and rejects incomplete metadata", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const form = validWebsiteForm();
    form.set("creatorAvatarUrl", "https://media.example.com/creators/studio.webp");
    form.set("creatorAvatarStorageProvider", "r2");
    form.set("creatorAvatarStorageKey", "creators/studio.webp");

    expect(parseAdminWebsiteForm(form).creator).toMatchObject({
      avatarStorageProvider: "r2",
      avatarStorageKey: "creators/studio.webp",
    });
    form.delete("creatorAvatarStorageKey");
    expect(() => parseAdminWebsiteForm(form)).toThrow(
      "Managed creator avatars must include their storage provider and key.",
    );
  });

  it("parses recording metadata without requiring sections", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const website = parseAdminWebsiteForm(validWebsiteForm());

    expect(website.media.map((media) => media.role)).toEqual(["recording", "favicon"]);
    expect(website.media[0]?.videoPreview?.format).toBe("mp4");
  });

  it("rejects recordings without verified preview and poster ownership", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const formData = validWebsiteForm();
    const media = JSON.parse(String(formData.get("media")));
    delete media[0].videoPreview;
    formData.set("media", JSON.stringify(media));
    expect(() => parseAdminWebsiteForm(formData)).toThrow();
  });

  it("ignores obsolete section fields when saving", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const form = validWebsiteForm();
    form.set("sections", "obsolete invalid payload");
    const website = parseAdminWebsiteForm(form);
    expect(website).not.toHaveProperty("sections");
    expect(website.media).toHaveLength(2);
  });

  it("marks a website as featured when selected", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
    const formData = validWebsiteForm();
    formData.set("isFeatured", "on");
    expect(parseAdminWebsiteForm(formData).isFeatured).toBe(true);
  });
});
