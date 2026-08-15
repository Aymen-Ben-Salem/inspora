import { describe, expect, it } from "vitest";

import { parseAdminPostForm } from "./post-validation";

function validForm() {
  const form = new FormData();
  form.set("slug", "example-project");
  form.set("title", "Example project");
  form.set("creatorId", "");
  form.set("creatorName", "Example Studio");
  form.set("creatorHandle", "@example");
  form.set("creatorUrl", "https://example.com");
  form.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  form.set("description", "A concise project description.");
  form.set("category", "Branding");
  form.set("industries", "Design, Culture");
  form.set("colors", "Black, White");
  form.set("styles", "Editorial, Minimal");
  form.set("sourceUrl", "https://example.com/project");
  form.set("status", "draft");
  form.set(
    "media",
    JSON.stringify([
      {
        type: "image",
        url: "/media/growspire.png",
        posterUrl: "",
        alt: "Example artwork",
        width: 1200,
        height: 1500,
      },
    ]),
  );
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

describe("admin post validation", () => {
  it("normalizes comma-separated tags and local media paths", () => {
    const result = parseAdminPostForm(validForm());

    expect(result.creator).toMatchObject({
      id: undefined,
      name: "Example Studio",
      avatarUrl: "/brand/default-avatar.svg",
    });
    expect(result.industries).toEqual(["Design", "Culture"]);
    expect(result.isFeatured).toBe(false);
    expect(result.media[0]).toMatchObject({
      url: "/media/growspire.png",
      posterUrl: undefined,
      width: 1200,
    });
  });

  it("marks a post as featured when selected", () => {
    const form = validForm();
    form.set("isFeatured", "on");

    expect(parseAdminPostForm(form).isFeatured).toBe(true);
  });

  it("accepts a selected existing creator", () => {
    const form = validForm();
    form.set("creatorId", "f97161eb-a54b-4f47-b30a-72334c03405d");

    expect(parseAdminPostForm(form).creator.id).toBe(
      "f97161eb-a54b-4f47-b30a-72334c03405d",
    );
  });

  it("preserves valid managed creator-avatar ownership metadata", () => {
    const form = validForm();
    form.set(
      "creatorAvatarUrl",
      "https://pub-example.r2.dev/creators/example.webp",
    );
    form.set("creatorAvatarStorageProvider", "r2");
    form.set("creatorAvatarStorageKey", "creators/example.webp");

    withR2BaseUrl(() => {
      expect(parseAdminPostForm(form).creator).toMatchObject({
        avatarStorageProvider: "r2",
        avatarStorageKey: "creators/example.webp",
      });
    });
  });

  it("rejects incomplete creator-avatar ownership metadata", () => {
    const form = validForm();
    form.set("creatorAvatarStorageProvider", "r2");

    expect(() => parseAdminPostForm(form)).toThrow();
  });

  it("rejects unsafe slugs and posts without media", () => {
    const form = validForm();
    form.set("slug", "Not Safe");
    form.set("media", "[]");

    expect(() => parseAdminPostForm(form)).toThrow();
  });

  it("preserves valid managed-media ownership metadata", () => {
    const form = validForm();
    form.set(
      "media",
      JSON.stringify([
        {
          type: "video",
          url: "https://pub-example.r2.dev/posts/example.mp4",
          posterUrl: "https://pub-example.r2.dev/posts/example.webp",
          storageProvider: "r2",
          storageKey: "posts/example.mp4",
          alt: "Example motion clip",
          width: 1920,
          height: 1080,
        },
      ]),
    );

    withR2BaseUrl(() => {
      expect(parseAdminPostForm(form).media[0]).toMatchObject({
        storageProvider: "r2",
        storageKey: "posts/example.mp4",
      });
    });
  });

  it("accepts an uploaded image without a video poster field", () => {
    const form = validForm();
    form.set(
      "media",
      JSON.stringify([
        {
          type: "image",
          url: "https://pub-example.r2.dev/posts/example.avif",
          storageProvider: "r2",
          storageKey: "posts/example.avif",
          alt: "Example artwork",
          width: 1200,
          height: 900,
        },
      ]),
    );

    withR2BaseUrl(() => {
      const media = parseAdminPostForm(form).media[0];
      expect(media).toMatchObject({
        type: "image",
        storageProvider: "r2",
      });
      expect(media?.posterUrl).toBeUndefined();
    });
  });

  it("preserves verified R2 media metadata", () => {
    const form = validForm();
    form.set(
      "media",
      JSON.stringify([
        {
          type: "image",
          url: "https://pub-example.r2.dev/posts/11111111-1111-4111-8111-111111111111.webp",
          storageProvider: "r2",
          storageKey: "posts/11111111-1111-4111-8111-111111111111.webp",
          mimeType: "image/webp",
          sizeBytes: 4096,
          variants: [],
          alt: "R2 artwork",
          width: 1200,
          height: 900,
        },
      ]),
    );

    withR2BaseUrl(() => {
      expect(parseAdminPostForm(form).media[0]).toMatchObject({
        storageProvider: "r2",
        mimeType: "image/webp",
        sizeBytes: 4096,
        variants: [],
      });
    });
  });

  it("rejects incomplete managed-media ownership metadata", () => {
    const form = validForm();
    form.set(
      "media",
      JSON.stringify([
        {
          type: "image",
          url: "https://pub-example.r2.dev/posts/example.jpg",
          storageProvider: "r2",
          alt: "Example",
          width: 1200,
          height: 900,
        },
      ]),
    );

    withR2BaseUrl(() => {
      expect(() => parseAdminPostForm(form)).toThrow();
    });
  });
});
