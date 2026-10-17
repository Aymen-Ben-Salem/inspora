import { afterEach, expect, it, vi } from "vitest";
import { createPreparedMediaUploadBundle } from "@/features/media/prepare-upload";
import { sponsorRequest, sponsorUploadOperations } from "./upload-operations";

afterEach(() => vi.unstubAllGlobals());

it.each([200, 404, 500, 504])(
  "reports unavailable suggestions for an HTML response with status %s",
  async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>Error</body></html>", {
        status,
        headers: { "Content-Type": "text/html" },
      }),
    ));

    await expect(
      sponsorRequest("metadata", "POST", { url: "https://product.example" }),
    ).rejects.toThrow(
      "Suggestions are unavailable. Continue with manual fields and uploads.",
    );
  },
);

it("preserves JSON API error messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    Response.json(
      { ok: false, message: "Verify sponsor access before uploading." },
      { status: 403 },
    ),
  ));

  await expect(sponsorRequest("metadata", "POST", {})).rejects.toThrow(
    "Verify sponsor access before uploading.",
  );
});

it("uses the preparation fallback for a non-JSON upload response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response("Service unavailable", { status: 503 }),
  ));

  await expect(sponsorRequest("uploads", "POST", {})).rejects.toThrow(
    "Sponsor preparation is unavailable.",
  );
});

it("preserves cancellation while reading a non-JSON response", async () => {
  const controller = new AbortController();
  const reason = new DOMException("Owner changed", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: async () => {
      controller.abort(reason);
      throw reason;
    },
  }));

  await expect(
    sponsorRequest("metadata", "POST", {}, controller.signal),
  ).rejects.toBe(reason);
});

it.each(["media", "icon", "wordmark", "poster"] as const)(
  "preserves the selected %s original and associates its prepared images",
  async (kind) => {
    const source = new File(["selected original PNG bytes"], "large.png", {
      type: "image/png",
    });
    const primary = new File(["optimized primary"], "large-2560.webp", {
      type: "image/webp",
    });
    const variant = new File(["optimized variant"], "large-640.webp", {
      type: "image/webp",
    });
    const uploads: Array<{
      id: string;
      kind: string;
      sourceAssetId?: string;
      bytes?: ArrayBuffer;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url === "/api/sponsorship/uploads" && init.method === "POST") {
          const upload = {
            id: `asset-${uploads.length}`,
            ...JSON.parse(init.body as string),
          };
          uploads.push(upload);
          return {
            ok: true,
            json: async () => ({
              id: upload.id,
              uploadUrl: `https://storage.example/${upload.id}`,
              method: "PUT",
              headers: {},
            }),
          };
        }
        if (url.startsWith("https://storage.example/")) {
          uploads.find((u) => url.endsWith(u.id))!.bytes = await (
            init.body as File
          ).arrayBuffer();
          return { ok: true };
        }
        const upload = uploads.find(
          (u) => u.id === JSON.parse(init.body as string).id,
        )!;
        return {
          ok: true,
          json: async () => ({
            ...upload,
            url: `/api/sponsorship/assets/${upload.id}`,
          }),
        };
      }),
    );
    const result = await sponsorUploadOperations(kind).upload(
      createPreparedMediaUploadBundle({
        source,
        kind: "sponsor-media",
        outputs: [
          {
            file: variant,
            width: 640,
            height: 320,
            uploadKind: "sponsor-media",
            role: "variant",
          },
          {
            file: primary,
            width: 2560,
            height: 1280,
            uploadKind: "sponsor-media",
            role: "primary",
          },
        ],
      }),
      () => {},
    );
    const original = uploads.find((u) => u.kind === "original");
    expect(original?.bytes).toEqual(await source.arrayBuffer());
    expect(
      uploads.filter((u) => u.kind !== "original").map((u) => u.sourceAssetId),
    ).toEqual([original!.id, original!.id]);
    expect(result.primary.sourceAssetId).toBe(original!.id);
  },
);
