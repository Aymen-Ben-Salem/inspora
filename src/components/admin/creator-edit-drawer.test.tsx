// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminActionState } from "@/features/admin/types";
import type { AdminCreatorRecord } from "@/features/creators/types";
import { parseAdminCreatorForm } from "@/features/creators/validation";

vi.mock("next/image", () => ({ default: () => null }));
const upload = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/features/media/prepare-and-upload", () => ({
  defaultUploadOperations: {}, prepareAndUploadMedia: upload.prepare,
}));

import { CreatorManager } from "./creator-manager";

const creator: AdminCreatorRecord = {
  id: "11111111-1111-4111-8111-111111111111", name: "Studio One", username: "studio_one", legacyHandle: "@studio_old",
  url: "https://studio.example.com", xProfileUrl: "https://x.com/studio_one", avatarUrl: "https://media.example.com/creators/old.webp",
  avatarStorageProvider: "r2", avatarStorageKey: "creators/old.webp", editedFields: [], recordOrigin: "preview",
  createdAt: "2026-10-19", updatedAt: "2026-10-19", workCount: 2, pendingClaimCount: 0,
};
const second = { ...creator, id: "22222222-2222-4222-8222-222222222222", name: "Studio Two", username: "studio_two" };
const reset = HTMLFormElement.prototype.reset;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  upload.prepare.mockReset().mockResolvedValue({ type: "image", url: "https://media.example.com/creators/new.webp", storageProvider: "r2", storageKey: "creators/new.webp" });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  vi.spyOn(HTMLFormElement.prototype, "reset").mockImplementation(function (this: HTMLFormElement) {
    if (this.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }))) reset.call(this);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function render(saveAction = vi.fn().mockResolvedValue({ status: "idle" }), creators = [creator], lockExistingCreators = false) {
  await act(async () => root.render(<CreatorManager creators={creators} claims={[]} saveAction={saveAction} deleteAction={vi.fn()} reviewAction={async () => {}} lockExistingCreators={lockExistingCreators} />));
  return saveAction;
}
const dialog = () => container.querySelector<HTMLDialogElement>("dialog")!;
const input = (name: string) => dialog().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label)!;
async function open(name = creator.name) {
  const trigger = container.querySelector<HTMLButtonElement>(`[aria-label="Edit ${name}"]`)!;
  trigger.focus(); await act(async () => trigger.click()); return trigger;
}
async function change(name: string, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(name), value); input(name).dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit() {
  const submitter = dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const form = dialog().querySelector<HTMLFormElement>("form")!;
  expect(submitter.form).toBe(form);
  await act(async () => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter })));
}

it("adds Edit beside View work and opens all profile fields without a form below the directory", async () => {
  await render();
  expect(container.querySelector('[name="creatorName"]')).toBeNull();
  const edit = container.querySelector('[aria-label="Edit Studio One"]')!;
  expect(edit.parentElement?.textContent).toBe("View workEdit");
  await open();
  expect(dialog().open).toBe(true);
  expect(document.activeElement).toBe(input("creatorName"));
  for (const [name, value] of Object.entries({ creatorId: creator.id, creatorName: creator.name, creatorUsername: creator.username, creatorHandle: creator.legacyHandle, creatorUrl: creator.url, creatorXProfileUrl: creator.xProfileUrl, creatorAvatarUrl: creator.avatarUrl })) expect(input(name).value).toBe(value);
  expect(dialog().textContent).not.toContain("Select creator");
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(photoInput.accept).toContain("image/png");
  expect(photoInput.closest("label")?.textContent).toBe("Upload new photo");
  expect(fetch).not.toHaveBeenCalled();
});

it("submits every edited profile field and retains the draft on errors for retry", async () => {
  const save = vi.fn(async (_state: AdminActionState, data: FormData): Promise<AdminActionState> => { parseAdminCreatorForm(data); return { status: "error", message: "That username is not available." }; });
  await render(save); await open();
  const fields = { creatorName: "Updated studio", creatorUsername: "updated_studio", creatorHandle: "@updated", creatorUrl: "https://updated.example.com", creatorXProfileUrl: "https://x.com/updated_studio", creatorAvatarUrl: "https://images.example.com/updated.webp" };
  for (const [name, value] of Object.entries(fields)) await change(name, value);
  await submit();
  expect(save).toHaveBeenCalledOnce();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({ id: creator.id, name: fields.creatorName, username: fields.creatorUsername, legacyHandle: fields.creatorHandle, url: fields.creatorUrl, xProfileUrl: fields.creatorXProfileUrl, avatarUrl: fields.creatorAvatarUrl, avatarStorageProvider: undefined, avatarStorageKey: undefined });
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("That username is not available.");
  for (const [name, value] of Object.entries(fields)) expect(input(name).value).toBe(value);
  await change("creatorUsername", "available_studio"); await submit();
  expect(save).toHaveBeenCalledTimes(2);
  expect(parseAdminCreatorForm(save.mock.calls[1][1])).toMatchObject({ id: creator.id, username: "available_studio", name: "Updated studio" });
});

it("preserves uploaded avatar ownership metadata when saving other profile changes", async () => {
  const save = await render(); await open();
  const file = new File(["image"], "new-profile.png", { type: "image/png" });
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(photoInput, "files", { configurable: true, value: [file] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  expect(upload.prepare).toHaveBeenCalledWith(file, "creator-avatar", expect.anything(), expect.any(Function), expect.any(Function));
  expect(input("creatorAvatarUrl").value).toBe("https://media.example.com/creators/new.webp");
  await change("creatorName", "New name");
  await submit();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({ id: creator.id, name: "New name", avatarUrl: "https://media.example.com/creators/new.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/new.webp" });
});

it("keeps the current profile picture if an upload fails and accepts a file retry", async () => {
  await render(); await open();
  upload.prepare.mockRejectedValueOnce(new Error("Image upload failed."));
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File(["image"], "profile.webp", { type: "image/webp" });
  Object.defineProperty(photoInput, "files", { configurable: true, value: [file] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("Image upload failed.");
  expect(input("creatorAvatarUrl").value).toBe(creator.avatarUrl);
  expect(input("creatorAvatarStorageKey").value).toBe(creator.avatarStorageKey);
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
  expect(input("creatorAvatarUrl").value).toBe("https://media.example.com/creators/new.webp");
});

it("opens the same sidebar with empty fields to create a new creator", async () => {
  const save = await render();
  await act(async () => button("Create a new creator").click());
  expect(input("creatorId").value).toBe(""); expect(input("creatorName").value).toBe(""); expect(input("creatorUsername").value).toBe("");
  expect(input("creatorAvatarUrl").value).toBe("/brand/default-avatar.svg");
  await change("creatorName", "New studio"); await change("creatorUsername", "new_studio"); await submit();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({ id: undefined, name: "New studio", username: "new_studio" });
});

it("closes with Escape, restores focus and scrolling, and keeps different creators' drafts separate", async () => {
  await render(undefined, [creator, second]);
  const trigger = await open(); await change("creatorName", "Unsaved name");
  expect(document.documentElement.style.overflow).toBe("hidden");
  await act(async () => dialog().dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(dialog()).toBeNull(); expect(document.activeElement).toBe(trigger); expect(document.documentElement.style.overflow).not.toBe("hidden");
  await open(second.name); expect(input("creatorName").value).toBe(second.name); expect(input("creatorUsername").value).toBe(second.username);
  await act(async () => button("Cancel").click());
  expect(dialog()).toBeNull();
});

it("keeps existing mirrored profiles read-only in Preview", async () => {
  await render(undefined, [{ ...creator, recordOrigin: "mirrored" }], true); await open();
  for (const name of ["creatorName", "creatorUsername", "creatorHandle", "creatorUrl", "creatorXProfileUrl", "creatorAvatarUrl"]) expect(input(name).readOnly).toBe(true);
  expect(button("Save creator").disabled).toBe(true);
  expect(dialog().textContent).toContain("read-only in Preview");
  expect(dialog().querySelector('input[type="file"]')).toBeNull();
});

it("prevents edits and dismissal while the save is in progress", async () => {
  let finish!: (state: AdminActionState) => void;
  const save = vi.fn(() => new Promise<AdminActionState>((resolve) => { finish = resolve; }));
  await render(save); await open(); await submit();
  expect(dialog().getAttribute("aria-busy")).toBe("true");
  expect(dialog().querySelector("fieldset")?.disabled).toBe(true);
  expect(button("Cancel").disabled).toBe(true);
  await act(async () => dialog().dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(dialog().open).toBe(true);
  await act(async () => finish({ status: "error", message: "Try again." }));
  expect(dialog().getAttribute("aria-busy")).toBe("false");
  expect(button("Save creator").disabled).toBe(false);
});
