import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ImageVariant } from "@/storage/types";

// These pure delivery tests call the component directly. DOM interaction tests
// exercise real React memoization, ref attachment, cleanup, and hydration.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
}));

import { ResponsiveR2Image } from "./responsive-r2-image";

const base = {
  src: "https://images.example.com/large.jpg",
  alt: "Design work",
  width: 1080,
  height: 659,
  sizes: "(min-width: 1120px) 395px, 100vw",
};

function variant(width: number, url = `https://media.example.com/${width}.webp`): ImageVariant {
  return { url, width, height: Math.round(width * 0.75), storageKey: `${width}.webp`, bytes: width, format: "webp" };
}

describe("ResponsiveR2Image delivery", () => {
  it.each([undefined, []])("resizes sources without generated variants (%s) through Next's responsive optimizer", (variants) => {
    const image = ResponsiveR2Image({ ...base, variants });

    expect(image.type).toBe("img");
    expect(image.props.src).toMatch(/^\/_next\/image\?/);
    expect(new URL(image.props.src!, "https://inspora.local").searchParams.get("url")).toBe(base.src);
    const sources: string[] = image.props.srcSet!.split(", ");
    expect(sources.length).toBeGreaterThan(1);
    expect(sources.some((source) => /\bw=640&/.test(source))).toBe(true);
    expect(sources.every((source) => /\/_next\/image\?.+ \d+w$/.test(source))).toBe(true);
    expect(image.props.sizes).toBe(base.sizes);
  });

  it("keeps generated variants native, sorted, deduplicated, and capped at the existing source width", () => {
    const image = ResponsiveR2Image({ ...base, variants: [variant(960), variant(640), variant(640, "https://media.example.com/duplicate.webp")] });

    expect(image.props.src).toBe(base.src);
    expect(image.props.srcSet).toBe(`https://media.example.com/640.webp 640w, https://media.example.com/960.webp 960w, ${base.src} 1080w`);
    expect(image.props.srcSet).not.toContain("/_next/image");
  });

  it("keeps a small generated image at its native width when the variant is the source", () => {
    const original = variant(64);
    const image = ResponsiveR2Image({ ...base, src: original.url, width: 64, height: 48, variants: [original], sizes: "35px" });

    expect(image.props.srcSet).toBe(`${original.url} 64w`);
    expect(image.props.src).toBe(original.url);
  });

  it.each([false, true])("preserves native sizing, styling, refs, events and priority (%s)", (priority) => {
    const ref = createRef<HTMLImageElement>();
    const onLoad = vi.fn();
    const onClick = vi.fn();
    const style = { opacity: 0.75 };
    const image = ResponsiveR2Image({ ...base, priority, className: "block h-auto w-full", style, ref, onLoad, onClick, draggable: false, "aria-label": "Open work" });

    expect(image.props).toMatchObject({ alt: base.alt, width: 1080, height: 659, sizes: base.sizes, className: "block h-auto w-full", draggable: false, "aria-label": "Open work", loading: priority ? "eager" : "lazy", fetchPriority: priority ? "high" : "auto", decoding: "async" });
    expect(image.props.style).toBe(style);
    const node = { complete: false } as HTMLImageElement;
    image.props.ref(node);
    expect(ref.current).toBe(node);
    image.props.ref(null);
    expect(ref.current).toBeNull();
    expect(image.props.onLoad).toBe(onLoad);
    expect(image.props.onClick).toBe(onClick);
  });

  it("also optimizes root-relative static sources", () => {
    const image = ResponsiveR2Image({ ...base, src: "/media/large.webp" });
    expect(new URL(image.props.src!, "https://inspora.local").searchParams.get("url")).toBe("/media/large.webp");
  });

  it.each([
    "https://media.example.com/loop.GIF?version=2#frame",
    "/media/loop.gif",
    "https://media.example.com/mark.SVG?version=2#symbol",
    "/brand/inspora.svg",
    "data:image/gif;base64,R0lGODlh",
    "blob:https://inspora.local/image-id",
    "//media.example.com/image.jpg",
  ])("preserves direct delivery for animated/vector or non-optimizer sources: %s", (src) => {
    const image = ResponsiveR2Image({ ...base, src });
    expect(image.props.src).toBe(src);
    expect(image.props.srcSet).toBe(`${src} 1080w`);
  });
});
