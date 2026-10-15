import { describe, expect, it } from "vitest";

import type { LogoMedia } from "@/domain/logo";

import { getLogoCardImageDimensions } from "./logo-card-image-dimensions";

const legacyMedia: LogoMedia = {
  id: "028ac089-09c9-4127-b54a-852f3edc5278",
  url: "https://mir-s3-cdn-cf.behance.net/project_modules/max_3840_webp/d5a6bc201268029.6671961f0ea17.jpg",
  alt: "Holy Mole logo",
  width: 1080,
  height: 659,
  variants: [],
};

describe("logo card image dimensions", () => {
  it("reserves the verified portrait ratio without changing the media object used by the detail dialog", () => {
    const media = Object.freeze({ ...legacyMedia });
    expect(getLogoCardImageDimensions(media)).toEqual({ width: 3840, height: 4800 });
    expect(media).toEqual(legacyMedia);
    expect(media.width).toBe(1080);
    expect(media.height).toBe(659);
  });

  it("does not reuse the correction when the media URL changes", () => {
    expect(getLogoCardImageDimensions({ ...legacyMedia, url: "https://images.example.com/replacement.jpg" })).toEqual({ width: 1080, height: 659 });
  });

  it("keeps ordinary media dimensions even if the URL matches another media record", () => {
    expect(getLogoCardImageDimensions({ ...legacyMedia, id: "another-media-record" })).toEqual({ width: 1080, height: 659 });
  });

  it("preserves existing generated-variant dimensions", () => {
    const media = {
      ...legacyMedia,
      variants: [{ url: "https://media.example.com/640.webp", storageKey: "640.webp", width: 640, height: 391, bytes: 1000, format: "webp" as const }],
    };
    expect(getLogoCardImageDimensions(media)).toEqual({ width: 1080, height: 659 });
  });
});
