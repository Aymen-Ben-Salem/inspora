import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const adapters = vi.hoisted(() => ({
  read: vi.fn(),
  suggest: vi.fn(),
  fetchPublic: vi.fn(),
  importAsset: vi.fn(),
}));
vi.mock("@/features/sponsorship/service", () => ({
  preparationService: { read: adapters.read },
}));
vi.mock("@/features/sponsorship/metadata", () => ({
  metadataFetcher: {
    suggest: adapters.suggest,
    fetchPublic: adapters.fetchPublic,
  },
}));
vi.mock("@/features/sponsorship/media", () => ({
  importSponsorSuggestion: adapters.importAsset,
}));
import { POST } from "./route";
const request = () =>
  new Request("https://preview.example/api/sponsorship/metadata", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://preview.example",
    },
    body: JSON.stringify({ url: "https://product.example" }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  adapters.read.mockResolvedValue({
    ok: true,
    value: { id: "private-preparation" },
  });
  adapters.suggest.mockResolvedValue({
    iconUrl: "https://product.example/icon.png",
    imageUrl: "https://product.example/og.png",
    wordmarkUrl: "https://product.example/brand.png",
  });
  adapters.fetchPublic.mockImplementation(async (url: string) => ({
    bytes: Buffer.from(url),
    headers: { "content-type": "image/png" },
  }));
  adapters.importAsset.mockImplementation(async (_bytes, _type, kind) => ({
    id: `owned-${kind}`,
    kind,
  }));
});
it("imports website icon, OG creative and wordmark into distinct owned asset roles", async () => {
  const response = await POST(request());
  expect(await response.json()).toMatchObject({
    ok: true,
    value: {
      iconId: "owned-icon",
      mediaId: "owned-media",
      wordmarkId: "owned-wordmark",
      assets: [{ kind: "icon" }, { kind: "media" }, { kind: "wordmark" }],
    },
  });
  expect(
    adapters.importAsset.mock.calls.map(([bytes, , kind]) => [
      bytes.toString(),
      kind,
    ]),
  ).toEqual([
    ["https://product.example/icon.png", "icon"],
    ["https://product.example/og.png", "media"],
    ["https://product.example/brand.png", "wordmark"],
  ]);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("keeps icon and OG results when the wordmark is unavailable or unsupported", async () => {
  adapters.fetchPublic.mockImplementation(async (url: string) => ({
    bytes: Buffer.from(url),
    headers: {
      "content-type": url.includes("brand") ? "image/svg+xml" : "image/png",
    },
  }));
  const body = await (await POST(request())).json();
  expect(body.value).toMatchObject({
    iconId: "owned-icon",
    mediaId: "owned-media",
  });
  expect(body.value.wordmarkId).toBeUndefined();
  expect(adapters.importAsset).toHaveBeenCalledTimes(2);
});
it("does not fetch or import website assets without verified preparation access", async () => {
  adapters.read.mockResolvedValue({ ok: false, code: "unauthenticated" });
  expect((await POST(request())).status).toBe(403);
  expect(adapters.suggest).not.toHaveBeenCalled();
  expect(adapters.importAsset).not.toHaveBeenCalled();
});
