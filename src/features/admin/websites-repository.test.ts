import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn() }));

import {
  collectWebsiteManagedAssets,
  getRetainedWebsiteStorageKeys,
} from "./website-media-ownership";

describe("website media ownership", () => {
  it("collects originals, previews, posters, favicons, sections, and variants", () => {
    const assets = collectWebsiteManagedAssets(
      [
        {
          role: "recording",
          storageProvider: "r2",
          storageKey: "recording",
          variants: [],
          videoPreview: { storageKey: "preview" },
          posterStorageKey: "poster",
        },
        {
          role: "favicon",
          storageProvider: "r2",
          storageKey: "favicon",
          variants: [{ storageKey: "favicon-variant" }],
          videoPreview: null,
          posterStorageKey: null,
        },
      ] as never,
      [
        {
          imageStorageProvider: "r2",
          imageStorageKey: "section",
          imageVariants: [{ storageKey: "section-variant" }],
        },
      ] as never,
    );

    expect(assets.map((asset) => asset.storageKey)).toEqual([
      "recording",
      "preview",
      "poster",
      "favicon",
      "favicon-variant",
      "section",
      "section-variant",
    ]);
    expect(assets[0]?.type).toBe("video");
    expect(assets[1]?.type).toBe("video");
  });

  it("retains every key referenced by a successful replacement", () => {
    const retained = getRetainedWebsiteStorageKeys({
      media: [
        {
          storageKey: "recording",
          posterStorageKey: "poster",
          videoPreview: { storageKey: "preview" },
          variants: [{ storageKey: "media-variant" }],
        },
      ],
      sections: [
        {
          storageKey: "section",
          variants: [{ storageKey: "section-variant" }],
        },
      ],
    } as never);

    expect([...retained]).toEqual([
      "recording",
      "poster",
      "preview",
      "media-variant",
      "section",
      "section-variant",
    ]);
  });
});
