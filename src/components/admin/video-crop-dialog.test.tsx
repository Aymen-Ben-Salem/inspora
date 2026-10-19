// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoCropDialog } from "./video-crop-dialog";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("supports presets, keyboard resizing and moving, and applies source-pixel coordinates", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const apply = vi.fn();
  const close = vi.fn();
  try {
    await act(async () => root.render(<VideoCropDialog url="/source.mp4" busy={false} status="" error="" onApply={apply} onClose={close} />));
    const video = container.querySelector("video")!;
    Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, duration: { value: 12 } });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
    const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text)!;
    await act(async () => button("Square").click());
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("420");
    const handle = container.querySelector('[aria-label="Resize crop bottom right"]')!;
    await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true })));
    const move = container.querySelector('[aria-label="Move crop"]')!;
    await act(async () => move.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await act(async () => button("Apply crop").click());
    expect(apply).toHaveBeenCalledWith({ crop: { x: 422, y: 0, width: 1070, height: 1070 }, sourceDimensions: { width: 1920, height: 1080 } });
    await act(async () => button("Reset crop").click());
    await act(async () => button("Apply crop").click());
    expect(apply).toHaveBeenLastCalledWith({ crop: { x: 0, y: 0, width: 1920, height: 1080 }, sourceDimensions: { width: 1920, height: 1080 } });
    await act(async () => container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(close).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("converts pointer movement from displayed pixels to recording pixels", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const apply = vi.fn();
  try {
    await act(async () => root.render(<VideoCropDialog url="/source.mp4" busy={false} status="" error="" onApply={apply} onClose={vi.fn()} />));
    const video = container.querySelector("video")!;
    Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, duration: { value: 10 } });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
    vi.spyOn(video.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 960 } as DOMRect);
    const buttons = () => Array.from(container.querySelectorAll("button"));
    await act(async () => buttons().find((item) => item.textContent === "Square")!.click());
    const move = container.querySelector<HTMLButtonElement>('[aria-label="Move crop"]')!;
    move.setPointerCapture = vi.fn();
    await act(async () => move.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true })));
    await act(async () => move.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 100, bubbles: true })));
    await act(async () => move.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    await act(async () => buttons().find((item) => item.textContent === "Apply crop")!.click());
    expect(apply).toHaveBeenCalledWith({ crop: { x: 620, y: 0, width: 1080, height: 1080 }, sourceDimensions: { width: 1920, height: 1080 } });
  } finally { await act(async () => root.unmount()); }
});
