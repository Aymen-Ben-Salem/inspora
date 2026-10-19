// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/features/media/prepare-and-upload", () => ({ prepareAndUploadMedia: mocks.prepare }));
vi.mock("./video-crop-dialog", () => ({ VideoCropDialog: ({ onApply, onClose, error }: { onApply: (crop: unknown) => void; onClose: () => void; error: string }) => <div><button type="button" onClick={() => onApply({ crop: { x: 0, y: 40, width: 1920, height: 1040 }, sourceDimensions: { width: 1920, height: 1080 } })}>Apply crop</button><button type="button" onClick={onClose}>Cancel</button><p role="alert">{error}</p></div> }));
import { WebsiteVideoCrop } from "./website-video-crop";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("downloads the original and sends the selected crop through the upload pipeline", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetchSource = vi.fn().mockResolvedValue(new Response(new Blob(["original"], { type: "video/webm" })));
  vi.stubGlobal("fetch", fetchSource);
  const uploaded = vi.fn();
  const busy = vi.fn();
  const media = { url: "/cropped.mp4", width: 1920, height: 1040 };
  mocks.prepare.mockResolvedValue(media);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WebsiteVideoCrop url="/original.webm" onUploaded={uploaded} onBusyChange={busy} />));
    await act(async () => container.querySelector("button")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply crop")!.click());
    expect(fetchSource).toHaveBeenCalledWith("/original.webm", expect.objectContaining({ mode: "cors" }));
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ type: "video/webm" }), "website-recording", undefined, expect.any(Function), expect.any(Function), { crop: { x: 0, y: 40, width: 1920, height: 1040 }, sourceDimensions: { width: 1920, height: 1080 } });
    expect(uploaded).toHaveBeenCalledWith(media);
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true, false]);
  } finally { await act(async () => root.unmount()); }
});

it("aborts conversion and ignores a late result after cancellation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["original"], { type: "video/mp4" }))));
  let complete!: (value: unknown) => void;
  const conversion = new AbortController();
  mocks.prepare.mockImplementation((_file, _kind, _operations, _status, onController) => {
    onController(conversion);
    return new Promise((resolve) => { complete = resolve; });
  });
  const uploaded = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WebsiteVideoCrop url="/original.mp4" onUploaded={uploaded} onBusyChange={vi.fn()} />));
    await act(async () => container.querySelector("button")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply crop")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!.click());
    expect(conversion.signal.aborted).toBe(true);
    await act(async () => complete({ url: "/late.mp4" }));
    expect(uploaded).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it("keeps the existing recording and allows retry when downloading fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  const uploaded = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WebsiteVideoCrop url="/missing.mp4" onUploaded={uploaded} onBusyChange={vi.fn()} />));
    await act(async () => container.querySelector("button")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply crop")!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Upload the video again");
    expect(uploaded).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
