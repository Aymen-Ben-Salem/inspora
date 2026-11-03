import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const io = vi.hoisted(() => ({ suggest: vi.fn(), fetch: vi.fn(), prepare: vi.fn(), reserve: vi.fn(), release: vi.fn() }));
vi.mock("@/features/sponsorship/metadata", () => ({ metadataFetcher: { suggest: io.suggest, fetchPublic: io.fetch }, SPONSOR_METADATA_TIMEOUT_MS: 15000 }));
vi.mock("@/features/sponsorship/suggestion-images", () => ({ prepareWebsiteSuggestion: io.prepare }));
vi.mock("@/features/sponsorship/draft-suggestion-budget", () => ({ reserveDraftSuggestion: io.reserve }));
import { POST } from "./route";
const request = (body = JSON.stringify({ url: "https://product.example" }), origin = "https://preview.example") => new Request("https://preview.example/api/sponsorship/metadata-draft", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body,
});
beforeEach(() => {
  vi.resetAllMocks();
  io.reserve.mockReturnValue(io.release);
  io.suggest.mockResolvedValue({ title: "Product", feedDescription: "A product", iconUrl: "https://product.example/icon.png", imageUrl: "https://product.example/og.png", wordmarkUrl: "https://product.example/wordmark.png" });
  io.fetch.mockResolvedValue({ bytes: Buffer.from("fixture"), headers: { "content-type": "image/png" } });
  io.prepare.mockImplementation(async (bytes, contentType) => ({ bytes, contentType }));
});
it("returns checked image bytes for a browser draft without a sponsor identity or owned asset IDs", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  const { value } = await response.json();
  expect(value).toEqual({ title: "Product", feedDescription: "A product", files: ["icon", "media", "wordmark"].map(kind => ({ kind, contentType: "image/png", base64: Buffer.from("fixture").toString("base64") })), missingAssets: [] });
  expect(io.fetch.mock.calls.every(([, size, signal]) => size === 1_000_000 && signal instanceof AbortSignal)).toBe(true);
  expect(io.prepare).toHaveBeenCalledTimes(3);
  expect(io.release).toHaveBeenCalledOnce();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(value).not.toHaveProperty("assets");
});
it.each([
  [JSON.stringify({ url: "https://product.example" }), "https://foreign.example"],
  [JSON.stringify({ url: "file:///etc/passwd" }), "https://preview.example"],
  [JSON.stringify({ url: "https://name:password@product.example" }), "https://preview.example"],
  [JSON.stringify({ url: "x".repeat(5000) }), "https://preview.example"],
  ["null", "https://preview.example"],
])("rejects untrusted or oversized input before fetching (%s)", async (body, origin) => {
  expect((await POST(request(body, origin))).status).toBe(422);
  expect(io.suggest).not.toHaveBeenCalled();
  expect(io.reserve).not.toHaveBeenCalled();
});
it("rejects excess requests without fetching and supplies a retry interval", async () => {
  io.reserve.mockReturnValue(null);
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(io.suggest).not.toHaveBeenCalled();
});
it("keeps text and usable images when a website asset is unsafe or exceeds the response budget", async () => {
  io.prepare.mockImplementation(async (bytes, contentType, kind) => {
    if (kind === "icon") throw new Error("Active SVG rejected");
    return { bytes: kind === "media" ? Buffer.alloc(1_000_001) : bytes, contentType };
  });
  const { value } = await (await POST(request())).json();
  expect(value.title).toBe("Product");
  expect(value.files.map((f: { kind: string }) => f.kind)).toEqual(["wordmark"]);
  expect(value.missingAssets).toEqual(["icon", "OG image"]);
  expect(io.release).toHaveBeenCalledOnce();
});
it("releases the concurrency reservation after an upstream failure", async () => {
  io.suggest.mockRejectedValue(new Error("Blocked network destination"));
  expect((await POST(request())).status).toBe(422);
  expect(io.fetch).not.toHaveBeenCalled();
  expect(io.release).toHaveBeenCalledOnce();
});
