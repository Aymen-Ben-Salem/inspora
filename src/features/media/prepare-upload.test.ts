import { describe, expect, it } from "vitest";

import { createPreparedMediaUploadBundle } from "./prepare-upload";

const source = { name: "source.gif", type: "image/gif", size: 128 } as File;
const primary = {
  file: { name: "source.mp4", type: "video/mp4", size: 96 } as File,
  width: 100,
  height: 100,
  uploadKind: "post-media" as const,
  role: "primary" as const,
};
const poster = {
  file: { name: "poster.webp", type: "image/webp", size: 32 } as File,
  width: 100,
  height: 100,
  uploadKind: "post-media" as const,
  role: "poster" as const,
};

describe("prepared media upload bundle", () => {
  it("keeps one selected source and associates generated outputs with it", () => {
    const bundle = createPreparedMediaUploadBundle({
      source,
      kind: "post-media",
      outputs: [primary, poster],
    });

    expect(bundle.source).toEqual({ file: source, kind: "post-media" });
    expect(bundle.primary).toBe(primary);
    expect(bundle.derivatives).toEqual([poster]);
    expect(bundle.outputs).toEqual([primary, poster]);
  });

  it("requires exactly one primary output", () => {
    expect(() =>
      createPreparedMediaUploadBundle({
        source,
        kind: "post-media",
        outputs: [poster],
      }),
    ).toThrow("exactly one primary");
    expect(() =>
      createPreparedMediaUploadBundle({
        source,
        kind: "post-media",
        outputs: [primary, { ...primary }],
      }),
    ).toThrow("exactly one primary");
  });
});
