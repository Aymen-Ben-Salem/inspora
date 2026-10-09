import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMetadataFetcher, fillEmptySponsorFields } from "./metadata";
describe("optional public-only metadata", () => {
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
      maxBytes: 1048576,
    });
    expect(
      fillEmptySponsorFields(
        { title: "Edited", iconId: "", mediaId: "" },
        { title: "Suggested", iconId: "owned-icon" },
      ),
    ).toEqual({ title: "Edited", iconId: "owned-icon", mediaId: "" });
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
      fillEmptySponsorFields({ title: "Manual", iconId: "", mediaId: "" }, {}),
    ).toEqual({ title: "Manual", iconId: "", mediaId: "" });
  });
});
