// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminWebsiteRecord } from "@/features/admin/types";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), crop: vi.fn() }));
vi.mock("@/features/media/prepare-and-upload", () => ({ prepareAndUploadMedia: mocks.prepare, defaultUploadOperations: {} }));
vi.mock("@/features/admin/image-crop", () => ({ cropImageFile: mocks.crop }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
import { WebsiteEditor } from "./website-editor";

const website: AdminWebsiteRecord = {
  id: "website", title: "Website", slug: "website", tagline: "A website", description: "Description", sourceUrl: "https://example.com",
  status: "draft", isFeatured: false, categories: ["Portfolio"], themes: ["Light"], colors: ["White"], technologies: [],
  createdAt: "2026-10-19", updatedAt: "2026-10-19",
  creator: { id: "creator", name: "Studio", username: "studio", avatarUrl: "/avatar.svg", recordOrigin: "preview", editedFields: [], createdAt: "2026-10-19", updatedAt: "2026-10-19" },
  media: [
    { role: "recording", url: "/recording.webm", posterUrl: "/poster.webp", width: 1200, height: 800, alt: "Recording" },
    { role: "favicon", url: "/original.webp", storageProvider: "r2", storageKey: "websites/old.webp", width: 127, height: 65, alt: "Original icon" },
  ],
};
const uploaded: UploadedAdminMedia = { type: "image", url: "/cropped.webp", storageProvider: "r2", storageKey: "websites/new.webp", width: 33, height: 65, alt: "Generated alt", mimeType: "image/webp", sourceMimeType: "image/png", sizeBytes: 100 };
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["source"], { type: "image/webp" }))));
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  mocks.crop.mockReset().mockResolvedValue(new File(["pixels"], "cropped.png", { type: "image/png" }));
  mocks.prepare.mockReset().mockResolvedValue(uploaded);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label)!;
const media = () => JSON.parse(container.querySelector<HTMLInputElement>('[name="media"]')!.value);
async function open() {
  await act(async () => button("Crop favicon").click());
  const image = container.querySelector<HTMLImageElement>('img[alt="Favicon crop preview"]')!;
  Object.defineProperties(image, { naturalWidth: { value: 127 }, naturalHeight: { value: 65 } });
  await act(async () => image.dispatchEvent(new Event("load")));
}

it("crops an existing favicon at single-pixel precision and saves its new metadata while preserving the recording and alt text", async () => {
  const action = vi.fn().mockResolvedValue({ status: "idle" });
  let finish!: (value: UploadedAdminMedia) => void;
  mocks.prepare.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<WebsiteEditor action={action} creators={[]} website={website} />));
  await open();
  expect(container.querySelector('[aria-label="Seek recording"]')).toBeNull();
  const fields = container.querySelectorAll<HTMLInputElement>('dialog input[type="number"]');
  expect(Array.from(fields).map((field) => field.value)).toEqual(["31", "0", "65", "65"]);
  expect(fields[2].step).toBe("1");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(fields[2], "33");
    fields[2].dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Center crop").click());
  await act(async () => button("Apply crop").click());
  expect(mocks.crop).toHaveBeenCalledWith(expect.any(Blob), { crop: { x: 47, y: 0, width: 33, height: 65 }, sourceDimensions: { width: 127, height: 65 } }, expect.any(AbortSignal));
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ type: "image/png" }), "website-favicon", undefined, expect.any(Function), expect.any(Function));
  expect(button("Save changes").disabled).toBe(true);
  await act(async () => finish(uploaded));
  expect(container.querySelector("dialog")).toBeNull();
  expect(button("Save changes").disabled).toBe(false);
  expect(media()[0]).toEqual(website.media[0]);
  expect(media()[1]).toMatchObject({ role: "favicon", url: uploaded.url, storageKey: uploaded.storageKey, width: 33, height: 65, alt: "Original icon" });
  const form = container.querySelector("form")!;
  await act(async () => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button("Save changes") })));
  expect(JSON.parse(action.mock.calls[0][1].get("media"))[1]).toMatchObject({ url: uploaded.url, storageKey: uploaded.storageKey, width: 33, height: 65 });
});

it("cancels without changing the current favicon and supports freeform, reset, and one-pixel keyboard movement", async () => {
  await act(async () => root.render(<WebsiteEditor action={vi.fn()} creators={[]} website={website} />));
  await open();
  await act(async () => button("Freeform").click());
  await act(async () => container.querySelector('[aria-label="Resize crop bottom right"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(container.querySelectorAll<HTMLInputElement>('dialog input[type="number"]')[2].value).toBe("126");
  await act(async () => container.querySelector('[aria-label="Move crop"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(container.querySelector<HTMLInputElement>('dialog input[type="number"]')!.value).toBe("1");
  await act(async () => button("Reset crop").click());
  expect(Array.from(container.querySelectorAll<HTMLInputElement>('dialog input[type="number"]')).map((field) => field.value)).toEqual(["0", "0", "127", "65"]);
  await act(async () => container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(container.querySelector("dialog")).toBeNull();
  expect(media()).toEqual(website.media);
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it("keeps the original icon on download errors and allows retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
  await act(async () => root.render(<WebsiteEditor action={vi.fn()} creators={[]} website={website} />));
  await open(); await act(async () => button("Apply crop").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Upload the image again");
  expect(media()).toEqual(website.media);
  expect(mocks.prepare).not.toHaveBeenCalled();
  await act(async () => button("Apply crop").click());
  expect(media()[1].url).toBe(uploaded.url);
});

it("aborts processing on cancel, enables saving immediately, and ignores a late upload", async () => {
  let finish!: (value: UploadedAdminMedia) => void;
  const controller = new AbortController();
  mocks.prepare.mockImplementation((_file, _kind, _operations, _status, onController) => {
    onController(controller);
    return new Promise((resolve) => { finish = resolve; });
  });
  await act(async () => root.render(<WebsiteEditor action={vi.fn()} creators={[]} website={website} />));
  await open(); await act(async () => button("Apply crop").click());
  await act(async () => button("Cancel processing").click());
  expect(controller.signal.aborted).toBe(true);
  expect(button("Save changes").disabled).toBe(false);
  await act(async () => finish(uploaded));
  expect(media()).toEqual(website.media);
});
