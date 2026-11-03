// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({prepare: vi.fn(), operations: {adminOnly: true}}));
vi.mock("@/features/media/prepare-and-upload", () => ({prepareAndUploadMedia: mocks.prepare, defaultUploadOperations: mocks.operations}));
vi.mock("next/image", () => ({default: () => null}));
import { AdminSponsorUpload } from "./sponsor-upload";
afterEach(() => {vi.clearAllMocks(); vi.unstubAllGlobals();});
it.each(["browse", "drop"])("uploads a full wordmark through the admin path by %s and locks duplicate uploads", async (method) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container), onUploaded = vi.fn(), busy = vi.fn();
  let resolve!: (value: unknown) => void;
  mocks.prepare.mockImplementation((_file, _kind, _ops, status) => {status("uploading");return new Promise((done) => {resolve = done;});});
  try {
    await act(async () => root.render(<AdminSponsorUpload label="Full wordmark" kind="sponsor-icon" disabled={false} onUploaded={onUploaded} onBusyChange={busy} />));
    const file = new File(["image"], "wordmark.png", {type: "image/png"});
    const trigger = () => {
      if (method === "browse") { const input = container.querySelector("input")!; Object.defineProperty(input, "files", {value: [file], configurable: true}); input.dispatchEvent(new Event("change", {bubbles: true})); }
      else {const event = new Event("drop", {bubbles: true, cancelable: true});Object.defineProperty(event, "dataTransfer", {value: {files: [file]}});container.querySelector("label")!.dispatchEvent(event);}
    };
    await act(async () => {trigger(); trigger();});
    expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.prepare.mock.calls[0].slice(0,3)).toEqual([file,"sponsor-icon",mocks.operations]);
    expect(container.querySelector("input")!.disabled).toBe(true);
    await act(async () => resolve({url: "/wordmark.webp"}));
    expect(onUploaded).toHaveBeenCalledWith({url: "/wordmark.webp"}); expect(busy.mock.calls).toEqual([[true],[false]]);
  } finally {await act(async () => root.unmount());}
});
it("aborts on unmount and ignores a late upload result", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container), uploaded = vi.fn(), controller = new AbortController();
  let resolve!: (value: unknown) => void;
  mocks.prepare.mockImplementation((_file,_kind,_ops,_status,onController) => {onController(controller);return new Promise(done => {resolve=done;});});
  await act(async () => root.render(<AdminSponsorUpload label="Icon" kind="sponsor-icon" disabled={false} onUploaded={uploaded} onBusyChange={() => {}} />));
  const input=container.querySelector("input")!;Object.defineProperty(input,"files",{value:[new File(["x"],"icon.png",{type:"image/png"})]});
  await act(async () => input.dispatchEvent(new Event("change",{bubbles:true})));
  await act(async () => root.unmount());expect(controller.signal.aborted).toBe(true);
  await act(async () => resolve({url:"/late.webp"}));expect(uploaded).not.toHaveBeenCalled();
});
