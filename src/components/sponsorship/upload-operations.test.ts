import { afterEach, expect, it, vi } from "vitest";
import { createPreparedMediaUploadBundle } from "@/features/media/prepare-upload";
import { sponsorUploadOperations } from "./upload-operations";

afterEach(() => vi.unstubAllGlobals());
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
