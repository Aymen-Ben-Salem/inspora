import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAttachmentDisposition,
  getLogoAssetFileName,
  getPublishedLogoAsset,
  getR2MediaAsset,
} = vi.hoisted(() => ({
  getAttachmentDisposition: vi.fn(
    (fileName: string) => `attachment; filename="${fileName}"`,
  ),
  getLogoAssetFileName: vi.fn(
    (slug: string, mimeType?: string) =>
      `${slug}.${mimeType === "image/webp" ? "webp" : "png"}`,
  ),
  getPublishedLogoAsset: vi.fn(),
  getR2MediaAsset: vi.fn(),
}));

vi.mock("@/data/logos-repository", () => ({ getPublishedLogoAsset }));
vi.mock("@/lib/logo-asset", () => ({
  getAttachmentDisposition,
  getLogoAssetFileName,
}));
vi.mock("@/storage/r2", () => ({ getR2MediaAsset }));

import { GET } from "./route";

const context = {
  params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
};

describe("GET /api/logos/[id]/asset", () => {
  beforeEach(() => {
    getPublishedLogoAsset.mockReset();
    getR2MediaAsset.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not expose missing or unpublished logos", async () => {
    getPublishedLogoAsset.mockResolvedValue(undefined);

    const response = await GET(
      new Request("http://localhost/api/logos/missing/asset"),
      context,
    );

    expect(response.status).toBe(404);
    expect(getR2MediaAsset).not.toHaveBeenCalled();
  });

  it("streams an R2 object as a direct attachment", async () => {
    getPublishedLogoAsset.mockResolvedValue({
      slug: "north-star",
      url: "https://media.example.com/logos/north-star.webp",
      storageProvider: "r2",
      storageKey: "logos/north-star.webp",
      mimeType: "image/webp",
    });
    getR2MediaAsset.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });

    const response = await GET(
      new Request("http://localhost/api/logos/logo-id/asset"),
      context,
    );

    expect(response.status).toBe(200);
    expect(getR2MediaAsset).toHaveBeenCalledWith("logos/north-star.webp");
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="north-star.webp"',
    );
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("proxies a database-backed external asset through the same origin", async () => {
    getPublishedLogoAsset.mockResolvedValue({
      slug: "local-mark",
      url: "https://media.example.com/local-mark.png",
      mimeType: "image/png",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([4, 5]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/logos/logo-id/asset"),
      context,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://media.example.com/local-mark.png"),
      { cache: "force-cache" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("2");
  });
});
