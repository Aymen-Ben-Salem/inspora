import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMetadataFetcher, fillEmptySponsorFields } from "./metadata";
describe("optional public-only metadata", () => {
  it("accepts HTML over one MiB while rejecting pages above two MiB", async () => {
    const prefix = Buffer.from("<title>Large product homepage</title>");
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: Buffer.concat([prefix, Buffer.alloc(1324320 - prefix.length, 32)]),
    });
    const fetcher = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
    });
    expect(await fetcher.suggest("https://example.com")).toMatchObject({
      title: "Large product homepage",
    });
    request.mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await expect(fetcher.suggest("https://example.com")).rejects.toThrow(
      "too large",
    );
  });
  it("pins a public address, follows bounded public redirects and preserves manual edits", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      bytes: Buffer.from(
        '<title>Suggested &amp; name</title><meta property="og:image" content="/cover.png">',
      ),
    });
    const fetcher = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
    });
    expect(await fetcher.suggest("https://example.com")).toMatchObject({
      title: "Suggested & name",
      imageUrl: "https://example.com/cover.png",
    });
    expect(request.mock.calls[0][0]).toMatchObject({
      address: "93.184.216.34",
      family: 4,
      maxBytes: 2 * 1024 * 1024,
    });
    expect(
      fillEmptySponsorFields(
        { title: "Edited", iconId: "", wordmarkId: "", mediaId: "" },
        { title: "Suggested", iconId: "owned-icon" },
      ),
    ).toEqual({
      title: "Edited",
      iconId: "owned-icon",
      wordmarkId: "",
      mediaId: "",
    });
  });
  it.each([
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://user:pass@example.com",
    "file:///etc/passwd",
    "http://[2002:7f00:1::]",
  ])("rejects %s before connecting", async (url) => {
    const request = vi.fn();
    const f = createMetadataFetcher({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      request,
    });
    await expect(f.suggest(url)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("blocks private DNS answers and private redirect targets", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 302,
      headers: { location: "http://169.254.169.254/latest" },
      bytes: Buffer.alloc(0),
    });
    const f = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
    });
    await expect(f.suggest("https://example.com")).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    const privateDns = createMetadataFetcher({
      resolve: async () => [{ address: "10.1.2.3", family: 4 }],
      request,
    });
    await expect(privateDns.suggest("https://example.com")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps manual entry available on extraction failure", async () => {
    const f = createMetadataFetcher({
      resolve: async () => {
        throw new Error("DNS unavailable");
      },
      request: vi.fn(),
    });
    await expect(f.suggest("https://example.com")).rejects.toThrow();
    expect(
      fillEmptySponsorFields(
        { title: "Manual", iconId: "", wordmarkId: "", mediaId: "" },
        {},
      ),
    ).toEqual({ title: "Manual", iconId: "", wordmarkId: "", mediaId: "" });
  });
  it.each([
    '<img alt="Product wordmark" src="/brand.png">',
    '<script type="application/ld+json">{"@type":"Organization","logo":"/brand.png"}</script>',
    '<script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":{"@type":"ImageObject","contentUrl":"/brand.png"}}]}</script>',
    '<header><a href="/"><img alt="Product logo" src="/brand.png"></a></header>',
  ])(
    "discovers a distinct wordmark alongside the icon and OG image: %s",
    async (brand) => {
      const f = createMetadataFetcher({
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
        request: async () => ({
          status: 200,
          headers: { "content-type": "text/html" },
          bytes: Buffer.from(
            `<link rel="icon" href="/icon.png"><meta property="og:image" content="/cover.png">${brand}`,
          ),
        }),
      });
      expect(await f.suggest("https://example.com")).toMatchObject({
        iconUrl: "https://example.com/icon.png",
        wordmarkUrl: "https://example.com/brand.png",
        imageUrl: "https://example.com/cover.png",
      });
    },
  );
  it("keeps valid site assets when optional markup is malformed and uses the first OG image", async () => {
    const f = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        bytes: Buffer.from(
          '<script type="application/ld+json">invalid json</script><img alt="wordmark" src="javascript:bad"><meta property="og:image" content="http://["><meta name="og:image" content="/first.png"><meta property="og:image" content="/second.png"><link rel="apple-touch-icon" href="/touch.png">',
        ),
      }),
    });
    expect(await f.suggest("https://example.com")).toMatchObject({
      iconUrl: "https://example.com/touch.png",
      imageUrl: "https://example.com/first.png",
      wordmarkUrl: undefined,
    });
  });
  it("fills missing website assets without overwriting uploaded branding or feed creative", () => {
    expect(
      fillEmptySponsorFields(
        {
          title: "Manual",
          iconId: "custom-icon",
          wordmarkId: "custom-wordmark",
          mediaId: "custom-media",
        },
        {
          title: "Site",
          iconId: "site-icon",
          wordmarkId: "site-wordmark",
          mediaId: "site-og",
        },
      ),
    ).toEqual({
      title: "Manual",
      iconId: "custom-icon",
      wordmarkId: "custom-wordmark",
      mediaId: "custom-media",
    });
    expect(
      fillEmptySponsorFields(
        { title: "", iconId: "", wordmarkId: "", mediaId: "" },
        {
          iconId: "site-icon",
          wordmarkId: "site-wordmark",
          mediaId: "site-og",
        },
      ),
    ).toMatchObject({
      iconId: "site-icon",
      wordmarkId: "site-wordmark",
      mediaId: "site-og",
    });
  });
  it.each([
    '<script type="application/ld+json">',
    '<img alt="wordmark"',
    "<header>",
  ])("handles bounded HTML with repeated unclosed %s tags", async (tag) => {
    const html = tag.repeat(Math.floor((2 * 1024 * 1024) / tag.length));
    const fetcher = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        bytes: Buffer.from(html),
      }),
    });
    expect(
      (await fetcher.suggest("https://example.com")).wordmarkUrl,
    ).toBeUndefined();
  });
});
