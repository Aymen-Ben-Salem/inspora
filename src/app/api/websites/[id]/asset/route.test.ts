import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createR2PresignedDownload,
  getPublishedWebsiteAsset,
  getR2MediaAsset,
} = vi.hoisted(() => ({
  createR2PresignedDownload: vi.fn(),
  getPublishedWebsiteAsset: vi.fn(),
  getR2MediaAsset: vi.fn(),
}));

vi.mock("@/data/websites-repository", () => ({ getPublishedWebsiteAsset }));
vi.mock("@/lib/website-media-actions", () => ({ getWebsiteSectionFileName: (slug: string, label: string) => `${slug}-${label.toLowerCase()}.webp` }));
vi.mock("@/lib/logo-asset", () => ({
  getAttachmentDisposition: (name: string) => `attachment; filename="${name}"`,
}));
vi.mock("@/storage/r2", () => ({
  createR2PresignedDownload,
  getR2MediaAsset,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "website-id" }) };

describe("GET /api/websites/[id]/asset", () => {
  beforeEach(() => {
    createR2PresignedDownload.mockReset();
    getPublishedWebsiteAsset.mockReset();
    getR2MediaAsset.mockReset();
  });

  it("redirects recording downloads without buffering the original", async () => {
    getPublishedWebsiteAsset.mockResolvedValue({
      kind: "recording",
      slug: "paper",
      url: "https://media.example.com/paper.webm",
      storageProvider: "r2",
      storageKey: "websites/paper.webm",
      mimeType: "video/webm",
    });
    createR2PresignedDownload.mockResolvedValue(
      "https://download.example.com/paper.webm",
    );

    const response = await GET(
      new Request("http://localhost/api/websites/website-id/asset"),
      context,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://download.example.com/paper.webm",
    );
    expect(createR2PresignedDownload).toHaveBeenCalledWith({
      storageKey: "websites/paper.webm",
      fileName: "paper-website.webm",
      contentType: "video/webm",
    });
    expect(getR2MediaAsset).not.toHaveBeenCalled();
  });

  it("returns only the selected section as a direct image attachment", async () => {
    getPublishedWebsiteAsset.mockResolvedValue({
      kind: "section",
      slug: "paper",
      label: "Hero",
      url: "https://media.example.com/hero.webp",
      storageProvider: "r2",
      storageKey: "websites/hero.webp",
      mimeType: "image/webp",
    });
    getR2MediaAsset.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/websites/website-id/asset?section=section-id",
      ),
      context,
    );

    expect(getPublishedWebsiteAsset).toHaveBeenCalledWith(
      "website-id",
      "section-id",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      "paper-hero.webp",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("does not expose missing or unpublished website assets", async () => {
    getPublishedWebsiteAsset.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/websites/missing/asset"),
      context,
    );
    expect(response.status).toBe(404);
  });
});
