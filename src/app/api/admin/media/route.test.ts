import { afterEach, beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  auth: vi.fn(), sign: vi.fn(), verify: vi.fn(), discard: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: boundary.auth }));
vi.mock("@/storage/r2", () => ({
  createR2PresignedUpload: boundary.sign, verifyR2Upload: boundary.verify,
  deleteR2StorageKeys: boundary.discard,
  getR2PublicUrl: (key: string) => `https://media.example/${key}`,
  isStorageKeyForKind: (key: string, kind: string) => kind === "logo-media" && key.startsWith("logos/"),
  R2StorageConfigurationError: class extends Error {},
}));
import { POST } from "./route";

function request(operation: string, input?: unknown, origin = "https://preview.example") {
  return new Request("https://preview.example/api/admin/media", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ operation, input }),
  });
}
const metadata = { kind: "logo-media", fileName: "logo.webp", contentType: "image/webp", size: 4 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("ADMIN_USER_IDS", "user_admin");
  boundary.auth.mockResolvedValue({ userId: "user_admin" });
  boundary.sign.mockResolvedValue({ provider: "r2", uploadUrl: "https://storage.example/upload", method: "PUT", headers: {}, storageKey: "logos/image.webp" });
  boundary.verify.mockResolvedValue(undefined);
  boundary.discard.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("signs a valid admin upload with private noncached responses", async () => {
  const response = await POST(request("sign", metadata));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ ok: true, storageKey: "logos/image.webp" });
  expect(boundary.sign).toHaveBeenCalledWith({ kind: "logo-media", contentType: "image/webp" });
});
it.each([null, "non-admin"])("denies upload access for user %s before touching storage", async (userId) => {
  boundary.auth.mockResolvedValue({ userId });
  const response = await POST(request("sign", metadata));
  expect(response.status).toBe(401);
  expect(boundary.sign).not.toHaveBeenCalled();
});
it("rejects cross-origin and non-JSON requests", async () => {
  expect((await POST(request("sign", metadata, "https://other.example"))).status).toBe(403);
  expect((await POST(new Request("https://preview.example/api/admin/media", { method: "POST", body: "plain" }))).status).toBe(415);
  expect(boundary.sign).not.toHaveBeenCalled();
});
it("keeps existing file type and size validation before signing", async () => {
  for (const input of [{ ...metadata, contentType: "video/mp4" }, { ...metadata, size: 11 * 1024 * 1024 }]) {
    expect(await (await POST(request("sign", input))).json()).toMatchObject({ ok: false });
  }
  expect(boundary.sign).not.toHaveBeenCalled();
});
it("verifies completed media using the existing storage checks", async () => {
  const response = await POST(request("complete", { ...metadata, storageKey: "logos/image.webp", width: 160, height: 160 }));
  expect(await response.json()).toMatchObject({ ok: true, media: { url: "https://media.example/logos/image.webp", storageKey: "logos/image.webp" } });
  expect(boundary.verify).toHaveBeenCalledOnce();
});
it("only discards storage keys allowed for the requested upload kind", async () => {
  await POST(request("discard", { kind: "logo-media", storageKeys: ["posts/other.webp"] }));
  expect(boundary.discard).not.toHaveBeenCalled();
  await POST(request("discard", { kind: "logo-media", storageKeys: ["logos/image.webp"] }));
  expect(boundary.discard).toHaveBeenCalledWith(["logos/image.webp"]);
});
it("returns converter configuration through the authenticated endpoint", async () => {
  expect(await (await POST(request("converter"))).json()).toEqual({ coreUrl: "https://media.example/system/ffmpeg/0.12.10/ffmpeg-core.js", wasmUrl: "https://media.example/system/ffmpeg/0.12.10/ffmpeg-core.wasm" });
});
it("rejects malformed requests and reports failed storage operations", async () => {
  expect((await POST(request("unknown"))).status).toBe(400);
  expect((await POST(new Request("https://preview.example/api/admin/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
  boundary.discard.mockRejectedValueOnce(new Error("storage failure"));
  expect((await POST(request("discard", { kind: "logo-media", storageKeys: ["logos/image.webp"] }))).status).toBe(500);
});
