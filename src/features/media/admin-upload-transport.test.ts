import { afterEach, expect, it, vi } from "vitest";

// These functions represent Next's remote action transport from an older build.
vi.mock("../admin/media-actions", () => ({
  createMediaUploadSignatureAction: vi.fn().mockRejectedValue(new Error('Server Action "4019eb957f29bfab59843e6eb998707f1e1c9e134f" was not found on the server.')),
  completeMediaUploadAction: vi.fn(), discardMediaUploadsAction: vi.fn(), getMediaConverterConfigurationAction: vi.fn(),
}));

import { defaultUploadOperations } from "./prepare-and-upload";
import { createPreparedMediaUploadBundle } from "./prepare-upload";

afterEach(() => vi.unstubAllGlobals());

it("uploads through stable HTTP endpoints instead of build-specific remote actions", async () => {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (url === "https://storage.example/upload") return new Response(null, { status: 200 });
    expect(url).toBe("/api/admin/media");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    const body = JSON.parse(String(init?.body));
    if (body.operation === "sign") {
      expect(body.input).toMatchObject({ kind: "logo-media", contentType: "image/webp" });
      return Response.json({ ok: true, provider: "r2", uploadUrl: "https://storage.example/upload", method: "PUT", headers: {}, storageKey: "logos/image.webp" });
    }
    expect(body.operation).toBe("complete");
    expect(body.input).toMatchObject({ storageKey: "logos/image.webp", width: 160, height: 160 });
    return Response.json({ ok: true, media: { type: "image", url: "https://media.example/image.webp", storageProvider: "r2", storageKey: "logos/image.webp", alt: "Logo", width: 160, height: 160 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const file = new File(["webp"], "logo.webp", { type: "image/webp" });
  const bundle = createPreparedMediaUploadBundle({ source: file, kind: "logo-media", outputs: [{ file, width: 160, height: 160, role: "primary", uploadKind: "logo-media" }] });

  expect(await defaultUploadOperations.upload(bundle, () => {})).toMatchObject({ storageKey: "logos/image.webp" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("cleans up signed assets after transfer failure through the same endpoint", async () => {
  const operations: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://storage.example/upload") return new Response(null, { status: 500 });
    const body = JSON.parse(String(init?.body));
    operations.push(body.operation);
    if (body.operation === "discard") {
      expect(body.input).toEqual({ kind: "logo-media", storageKeys: ["logos/image.webp"] });
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, provider: "r2", uploadUrl: "https://storage.example/upload", method: "PUT", headers: {}, storageKey: "logos/image.webp" });
  }));
  const file = new File(["webp"], "logo.webp", { type: "image/webp" });
  const bundle = createPreparedMediaUploadBundle({ source: file, kind: "logo-media", outputs: [{ file, width: 160, height: 160, role: "primary", uploadKind: "logo-media" }] });
  await expect(defaultUploadOperations.upload(bundle, () => {})).rejects.toThrow("The storage service rejected the upload.");
  expect(operations).toEqual(["sign", "discard"]);
});

it("reports HTTP authorization errors without reloading the page or retrying uploads", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: "Please sign in as an administrator and retry the upload." }, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(defaultUploadOperations.converterConfiguration()).rejects.toThrow("Please sign in as an administrator and retry the upload.");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("gets converter configuration without a build-specific action", async () => {
  const configuration = { coreUrl: "https://media.example/core.js", wasmUrl: "https://media.example/core.wasm" };
  const fetchMock = vi.fn().mockResolvedValue(Response.json(configuration));
  vi.stubGlobal("fetch", fetchMock);
  expect(await defaultUploadOperations.converterConfiguration()).toEqual(configuration);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ operation: "converter" });
});
