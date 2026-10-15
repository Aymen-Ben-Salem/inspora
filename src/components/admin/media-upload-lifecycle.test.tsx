// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/features/media/prepare-and-upload", () => ({ prepareAndUploadMedia: mocks.prepare, defaultUploadOperations: {} }));
import { MediaUploadButton } from "./media-upload-button";

it("cancels conversion when the editor unmounts and ignores a late result", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const controller = new AbortController();
  let complete!: (value: unknown) => void;
  mocks.prepare.mockImplementation((_file, _kind, _operations, _status, onController) => {
    onController(controller);
    return new Promise((resolve) => { complete = resolve; });
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  const uploaded = vi.fn();
  try {
    await act(async () => root.render(<MediaUploadButton onUploaded={uploaded} />));
    const input = container.querySelector("input")!;
    Object.defineProperty(input, "files", { value: [new File(["video"], "video.mp4", { type: "video/mp4" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => root.unmount());
    expect(controller.signal.aborted).toBe(true);
    await act(async () => complete({ url: "/late-result" }));
    expect(uploaded).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
