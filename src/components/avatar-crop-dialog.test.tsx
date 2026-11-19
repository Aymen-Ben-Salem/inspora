// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvatarCropDialog } from "./avatar-crop-dialog";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function renderDialog(width: number, height: number) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = { onApply: vi.fn(), onCancel: vi.fn(), onReject: vi.fn() };
  await act(async () => root.render(<AvatarCropDialog file={new File(["x"], "photo.png", { type: "image/png" })} {...props} />));
  const image = container.querySelector("img")!;
  Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
  await act(async () => image.dispatchEvent(new Event("load")));
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text)!;
  const cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
  return { container, props, button, cleanup };
}

it("applies the centred square, then a zoomed and moved square in source pixels", async () => {
  const { container, props, button, cleanup } = await renderDialog(1200, 800);
  try {
    await act(async () => button("Use photo").click());
    expect(props.onApply).toHaveBeenLastCalledWith({ x: 200, y: 0, size: 800 });

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.max).toBe("3.125");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "2");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const viewport = container.querySelector('[aria-label="Photo position"]')!;
    await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true })));
    await act(async () => button("Use photo").click());
    expect(props.onApply).toHaveBeenLastCalledWith({ x: 360, y: 200, size: 400 });
  } finally { await cleanup(); }
});

it("rejects photos below the minimum before cropping", async () => {
  const { props, cleanup } = await renderDialog(255, 900);
  try {
    expect(props.onReject).toHaveBeenCalledWith(expect.stringContaining("256 × 256"));
  } finally { await cleanup(); }
});

it("warns softly when the crop is under the recommended size and cannot zoom further", async () => {
  const { container, cleanup } = await renderDialog(300, 300);
  try {
    expect(container.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(false);
    expect(container.textContent).toContain("300 × 300 px — under 400 × 400");
  } finally { await cleanup(); }
});

it("cancels on Escape without letting a surrounding modal see the key", async () => {
  const { container, props, cleanup } = await renderDialog(600, 600);
  const outside = vi.fn();
  document.addEventListener("keydown", outside);
  try {
    const viewport = container.querySelector('[aria-label="Photo position"]')!;
    await act(async () => viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
  } finally { document.removeEventListener("keydown", outside); await cleanup(); }
});
