// @vitest-environment happy-dom
import { act, createRef, type ComponentProps } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ResponsiveR2Image } from "./responsive-r2-image";

const base = { src: "https://media.example.com/image/extensionless", alt: "Work", width: 1080, height: 659, className: "block h-auto w-full", sizes: "100vw" };
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(props: Partial<ComponentProps<typeof ResponsiveR2Image>> = {}) {
  root = createRoot(container);
  await act(async () => root!.render(<ResponsiveR2Image {...base} {...props} />));
  return container.querySelector("img")!;
}

it.each([base.src, `${base.src}?crop=0,0,100,100`])("retries the original extensionless SVG URL once and forwards native events (%s)", async (src) => {
  const onError = vi.fn();
  const onLoad = vi.fn();
  const onClick = vi.fn();
  const image = await mount({ src, onError, onLoad, onClick, priority: true, style: { opacity: 0.75 } });
  const originalAttributes = [...image.attributes].filter(({ name }) => name !== "src" && name !== "srcset").map(({ name, value }) => [name, value]);
  expect(image.getAttribute("src")).toMatch(/^\/_next\/image\?/);

  // The optimizer rejects an SVG response even when its URL has no .svg suffix.
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(image.getAttribute("src")).toBe(src);
  expect(image.getAttribute("srcset")).toBe(`${src} ${base.width}w`);
  expect(onError).not.toHaveBeenCalled();
  expect([...image.attributes].filter(({ name }) => name !== "src" && name !== "srcset").map(({ name, value }) => [name, value])).toEqual(originalAttributes);
  expect(container.children).toHaveLength(1);
  expect(container.firstElementChild).toBe(image);

  await act(async () => image.dispatchEvent(new Event("load")));
  image.click();
  expect(onLoad).toHaveBeenCalledOnce();
  expect(onClick).toHaveBeenCalledOnce();
  // A failure of the original reaches the caller without retrying indefinitely.
  const setAttribute = vi.spyOn(image, "setAttribute");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(onError).toHaveBeenCalledOnce();
  expect(setAttribute).not.toHaveBeenCalled();
});

it("recovers an optimized image that already failed before hydration", async () => {
  const ref = createRef<HTMLImageElement>();
  const onError = vi.fn();
  container.innerHTML = renderToString(<ResponsiveR2Image {...base} ref={ref} onError={onError} />);
  const image = container.querySelector("img")!;
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });

  await act(async () => { root = hydrateRoot(container, <ResponsiveR2Image {...base} ref={ref} onError={onError} />); });
  expect(image.getAttribute("src")).toBe(base.src);
  expect(ref.current).toBe(image);
  expect(onError).not.toHaveBeenCalled();
  await act(async () => root!.unmount());
  root = undefined;
  expect(ref.current).toBeNull();
});

it("preserves callback-ref cleanup rather than also calling that ref with null", async () => {
  const cleanup = vi.fn();
  const ref = vi.fn(() => cleanup);
  const image = await mount({ ref });
  expect(ref).toHaveBeenCalledExactlyOnceWith(image);
  await act(async () => root!.unmount());
  root = undefined;
  expect(cleanup).toHaveBeenCalledOnce();
  expect(ref).toHaveBeenCalledOnce();
});

it("keeps a callback ref attached across rerenders of unchanged image props", async () => {
  const cleanup = vi.fn();
  const ref = vi.fn(() => cleanup);
  const image = await mount({ ref });
  await act(async () => root!.render(<ResponsiveR2Image {...base} ref={ref} />));
  expect(container.querySelector("img")).toBe(image);
  expect(cleanup).not.toHaveBeenCalled();
  expect(ref).toHaveBeenCalledExactlyOnceWith(image);
});

it("calls a callback ref without cleanup with null when detached", async () => {
  const ref = vi.fn();
  const image = await mount({ ref });
  expect(ref).toHaveBeenCalledWith(image);
  await act(async () => root!.unmount());
  root = undefined;
  expect(ref).toHaveBeenLastCalledWith(null);
});

it.each([
  { src: "/mark.svg" },
  { src: base.src, variants: [{ url: "https://media.example.com/640.webp", storageKey: "640.webp", width: 640, height: 390, bytes: 1000, format: "webp" as const }] },
])("leaves managed variants and known SVG sources under their existing native error behavior (%s)", async (props) => {
  const onError = vi.fn();
  const image = await mount({ ...props, onError });
  const srcSet = image.getAttribute("srcset");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(image.getAttribute("src")).toBe(props.src);
  expect(image.getAttribute("srcset")).toBe(srcSet);
  expect(onError).toHaveBeenCalledOnce();
});
