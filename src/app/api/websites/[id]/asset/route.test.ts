import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublishedWebsiteAsset, getR2MediaAsset } = vi.hoisted(() => ({
  getPublishedWebsiteAsset: vi.fn(),
  getR2MediaAsset: vi.fn(),
}));

vi.mock("@/data/websites-repository", () => ({ getPublishedWebsiteAsset }));
vi.mock("@/lib/website-media-actions", () => ({
  getWebsiteSectionFileName: (slug: string, label: string) =>
    slug + "-" + label.toLowerCase() + ".webp",
}));
vi.mock("@/lib/logo-asset", () => ({
  getAttachmentDisposition: (name: string) =>
    "attachment; filename=\"" + name + "\"",
}));
vi.mock("@/storage/r2", () => ({ getR2MediaAsset }));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "website-id" }) };

describe("GET /api/websites/[id]/asset", () => {
  beforeEach(() => {
    getPublishedWebsiteAsset.mockReset();
    getR2MediaAsset.mockReset();
    vi.unstubAllGlobals();
  });

  it("streams recording downloads as direct attachments without buffering", async () => {
    getPublishedWebsiteAsset.mockResolvedValue({
      kind: "recording",
      slug: "paper",
      url: "https://media.example.com/paper.webm",
      storageProvider: "r2",
      storageKey: "websites/paper.webm",
      mimeType: "video/webm",
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": "3",
          "Content-Type": "video/webm",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/websites/website-id/asset"),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      "paper-website.webm",
    );
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://media.example.com/paper.webm"),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(getR2MediaAsset).not.toHaveBeenCalled();
  });

  it("forwards recording byte ranges while keeping attachment headers", async () => {
    getPublishedWebsiteAsset.mockResolvedValue({
      kind: "recording",
      slug: "paper",
      url: "/media/paper.mp4",
      storageProvider: "external",
      storageKey: null,
      mimeType: "video/mp4",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([2, 3]), {
        status: 206,
        headers: {
          "Content-Length": "2",
          "Content-Range": "bytes 1-2/3",
          "Content-Type": "video/mp4",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/websites/website-id/asset", {
        headers: { Range: "bytes=1-2" },
      }),
      context,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Disposition")).toContain(
      "paper-website.mp4",
    );
    expect(response.headers.get("Content-Range")).toBe("bytes 1-2/3");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost/media/paper.mp4"),
      expect.objectContaining({ headers: { Range: "bytes=1-2" } }),
    );
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
