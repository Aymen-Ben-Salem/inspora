// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminActionState } from "@/features/admin/types";
import type { AdminCreatorRecord } from "@/features/creators/types";
import { parseAdminCreatorForm } from "@/features/creators/validation";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@clerk/nextjs", () => ({ useReverification: (action: (...args: unknown[]) => Promise<object>) => async (...args: unknown[]) => {
  const result = await action(...args);
  if ("clerk_error" in result) throw { verificationCanceled: true };
  return result;
} }));
vi.mock("@clerk/nextjs/errors", () => ({ isReverificationCancelledError: (error: { verificationCanceled?: boolean }) => error?.verificationCanceled === true }));
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
  vi.stubGlobal("confirm", vi.fn(() => true));
  upload.prepare.mockReset().mockResolvedValue({ type: "image", url: "https://media.example.com/creators/new.webp", storageProvider: "r2", storageKey: "creators/new.webp" });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  vi.spyOn(HTMLDialogElement.prototype, "show").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLFormElement.prototype, "reset").mockImplementation(function (this: HTMLFormElement) {
    if (this.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }))) reset.call(this);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function render(saveAction = vi.fn().mockResolvedValue({ status: "idle" }), creators = [creator], lockExistingCreators = false, deleteAction = vi.fn(), permanentAction = vi.fn().mockResolvedValue({ status: "error", message: "Try again." })) {
  await act(async () => root.render(<CreatorManager creators={creators} claims={[]} saveAction={saveAction} trashAction={deleteAction} restoreAction={deleteAction} deleteAction={permanentAction} reviewAction={async () => {}} lockExistingCreators={lockExistingCreators} />));
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

it("puts View work, Edit, and Trash together and opens all profile fields without a form below the directory", async () => {
  await render();
  expect(container.querySelector('[name="creatorName"]')).toBeNull();
  const edit = container.querySelector('[aria-label="Edit Studio One"]')!;
  expect(edit.parentElement?.textContent).toBe("View workEdit");
  const trash = edit.parentElement?.querySelector('[aria-label="Move to Trash: Studio One"]');
  expect(trash?.querySelector("svg")).not.toBeNull();
  expect(trash?.classList.contains("text-red-600")).toBe(true);
  expect(container.querySelector('[aria-label="Creator status"] a[href="/admin/creators?view=trash"]')?.textContent).toBe("Trash");
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

it("opens trash confirmation without blocking the click on a browser confirm dialog", async () => {
  const remove = vi.fn().mockResolvedValue({ status: "idle" });
  await render(undefined, [creator], true, remove);
  const target = container.querySelector<HTMLButtonElement>('[aria-label="Move to Trash: Studio One"]')!;
  target.focus();
  await act(async () => target.click());
  expect(window.confirm).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(dialog().open).toBe(true);
  expect(dialog().textContent).toContain("Studio One");
  await act(async () => button("Cancel").click());
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(target);
});

it("offers permanent deletion only in Trash and requires the exact username", async () => {
  const remove = vi.fn().mockResolvedValue({ status: "error", message: "Creator changed. Refresh Trash." });
  await render(undefined, [creator], false, undefined, remove);
  expect(container.querySelector('[aria-label="Delete forever: Studio One"]')).toBeNull();
  await render(undefined, [{ ...creator, ownerUserId: "owner", trashedAt: "2026-10-30T00:00:00Z" }], false, undefined, remove);
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Delete forever: Studio One"]')!;
  trigger.focus(); await act(async () => trigger.click());
  expect(dialog().textContent).toContain("all 2 attributed works");
  expect(dialog().textContent).toContain("linked user account will also be closed");
  expect(button("Delete forever").disabled).toBe(true);
  await change("confirmation", "wrong"); expect(button("Delete forever").disabled).toBe(true);
  await change("confirmation", creator.username!); expect(button("Delete forever").disabled).toBe(false);
  await submit();
  expect(remove).toHaveBeenCalledOnce();
  expect(remove.mock.calls[0][1].get("confirmation")).toBe(creator.username);
  expect(remove.mock.calls[0][1].get("expectedWorkCount")).toBe("2");
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("Creator changed. Refresh Trash.");
  await act(async () => button("Cancel").click());
  expect(document.activeElement).toBe(trigger);
});

it("lets Clerk's verification portal receive focus and restores confirmation if verification is canceled", async () => {
  const remove = vi.fn().mockResolvedValue({ clerk_error: "reverification" });
  await render(undefined, [{ ...creator, trashedAt: "2026-10-30T00:00:00Z" }], false, undefined, remove);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete forever: Studio One"]')!.click());
  await change("confirmation", creator.username!);
  await submit();
  expect(HTMLDialogElement.prototype.show).toHaveBeenCalledOnce();
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Nothing was deleted");
  expect(input("confirmation").value).toBe(creator.username);
  expect(dialog().open).toBe(true);
});

it("moves the chosen creator to Trash without needing to open its editor", async () => {
  const remove = vi.fn().mockResolvedValue({ status: "error", message: "This creator has claim history." });
  await render(undefined, [creator, { ...second, workCount: 0 }], true, remove);
  const target = container.querySelector<HTMLButtonElement>('[aria-label="Move to Trash: Studio Two"]')!;
  expect(target.disabled).toBe(false);
  await act(async () => target.click());
  await submit();
  expect(remove).toHaveBeenCalledOnce();
  expect(remove.mock.calls[0][1].get("creatorId")).toBe(second.id);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("This creator has claim history.");
  expect(dialog().open).toBe(true);
});

it.each([
  { workCount: 1 }, { ownerUserId: "owner" }, { xProviderId: "provider" }, { pendingClaimCount: 1 }, { recordOrigin: "mirrored" as const },
])("allows reversible Trash for creators with work, ownership, claims or imported origin: %j", async (restriction) => {
  const remove = vi.fn().mockResolvedValue({ status: "idle" });
  await render(undefined, [{ ...creator, workCount: 0, ...restriction }], true, remove);
  const target = container.querySelector<HTMLButtonElement>('[aria-label="Move to Trash: Studio One"]')!;
  expect(target.disabled).toBe(false);
  await act(async () => target.click());
  await submit();
  expect(remove).toHaveBeenCalledOnce();
  expect(remove.mock.calls[0][1].get("operation")).toBe("trash");
});

it("restores a creator from Trash and permits cancelling a trash request", async () => {
  const changeState = vi.fn().mockResolvedValue({ status: "idle" });
  await render(undefined, [{ ...creator, trashedAt: "2026-10-30T00:00:00Z" }], true, changeState);
  await act(async () => button("Restore").click());
  expect(changeState.mock.calls[0][1].get("operation")).toBe("restore");
  expect(window.confirm).not.toHaveBeenCalled();
  changeState.mockClear();
  await render(undefined, [creator], true, changeState);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move to Trash: Studio One"]')!.click());
  await act(async () => button("Cancel").click());
  expect(changeState).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
});

it("keeps trash confirmation responsive while saving and supports retry after failure", async () => {
  let finish!: (state: AdminActionState) => void;
  const remove = vi.fn(() => new Promise<AdminActionState>(resolve => { finish = resolve; }));
  await render(undefined, [creator], false, remove);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move to Trash: Studio One"]')!.click());
  await submit();
  expect(dialog().getAttribute("aria-busy")).toBe("true");
  expect(button("Cancel").disabled).toBe(true);
  expect(button("Moving…").disabled).toBe(true);
  await act(async () => dialog().dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(dialog().open).toBe(true);
  await act(async () => finish({ status: "error", message: "Try again." }));
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("Try again.");
  expect(button("Move to Trash").disabled).toBe(false);
  await submit();
  expect(remove).toHaveBeenCalledTimes(2);
  await act(async () => finish({ status: "idle" }));
  expect(dialog()).toBeNull();
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

it("lets an admin add a public X link for an owned creator without a verified X identity", async () => {
  const save = await render(undefined, [{ ...creator, ownerUserId: "admin", xProfileUrl: undefined }]);
  await open();
  expect(input("creatorXProfileUrl").readOnly).toBe(false);
  await change("creatorXProfileUrl", "https://x.com/studio_one");
  await submit();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({
    id: creator.id, xProfileUrl: "https://x.com/studio_one",
  });
});

it("explains why a verified X link is read-only and still saves other creator details", async () => {
  const save = await render(undefined, [{ ...creator, ownerUserId: "admin", xProviderId: "verified-provider" }]);
  await open();
  expect(input("creatorXProfileUrl").readOnly).toBe(true);
  expect(dialog().textContent).toContain("To change it, the creator must update their connected X account.");
  expect(input("creatorName").readOnly).toBe(false);
  await change("creatorName", "Updated studio");
  await submit();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({
    id: creator.id, name: "Updated studio", xProfileUrl: creator.xProfileUrl,
  });
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

it("keeps the sidebar and draft open when the photo file picker is canceled", async () => {
  const save = await render(); await open();
  await change("creatorName", "Unsaved studio name");
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => photoInput.dispatchEvent(new Event("cancel", { bubbles: true })));
  expect(dialog()?.open).toBe(true);
  expect(input("creatorName").value).toBe("Unsaved studio name");
  expect(input("creatorAvatarUrl").value).toBe(creator.avatarUrl);
  expect(upload.prepare).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(document.documentElement.style.overflow).toBe("hidden");

  const file = new File(["image"], "profile.png", { type: "image/png" });
  Object.defineProperty(photoInput, "files", { configurable: true, value: [file] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  expect(input("creatorAvatarUrl").value).toBe("https://media.example.com/creators/new.webp");
  expect(input("creatorName").value).toBe("Unsaved studio name");
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

it.each([false, true])("discards unsaved profile changes when canceling and reopening the same creator (immediate: %s)", async (immediate) => {
  const save = await render(); await open();
  await change("creatorName", "Unsaved studio");
  await change("creatorUsername", "unsaved_studio");
  await change("creatorUrl", "https://unsaved.example.com");
  await change("creatorAvatarUrl", "https://images.example.com/unsaved.webp");
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Edit Studio One"]')!;
  if (immediate) {
    await act(async () => { button("Cancel").click(); trigger.click(); });
  } else {
    await act(async () => button("Cancel").click());
    expect(dialog()).toBeNull();
    await open();
  }
  expect(input("creatorName").value).toBe(creator.name);
  expect(input("creatorUsername").value).toBe(creator.username);
  expect(input("creatorUrl").value).toBe(creator.url);
  expect(input("creatorAvatarUrl").value).toBe(creator.avatarUrl);
  expect(input("creatorAvatarStorageKey").value).toBe(creator.avatarStorageKey);
  expect(save).not.toHaveBeenCalled();
});

it("clears a failed save's draft and validation message after Cancel and reopening", async () => {
  await render(vi.fn().mockResolvedValue({ status: "error", message: "That username is unavailable." })); await open();
  await change("creatorName", "Unsaved name"); await submit();
  expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => { button("Cancel").click(); container.querySelector<HTMLButtonElement>('[aria-label="Edit Studio One"]')!.click(); });
  expect(input("creatorName").value).toBe(creator.name);
  expect(dialog().querySelector('[role="alert"]')).toBeNull();
});

it("does not restore a canceled photo upload when it finishes after the creator is reopened", async () => {
  let finish!: (media: unknown) => void;
  upload.prepare.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await render(); await open();
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(photoInput, "files", { configurable: true, value: [new File(["image"], "new-profile.png", { type: "image/png" })] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => { button("Cancel").click(); container.querySelector<HTMLButtonElement>('[aria-label="Edit Studio One"]')!.click(); });
  await act(async () => finish({ type: "image", url: "https://media.example.com/creators/canceled.webp", storageProvider: "r2", storageKey: "creators/canceled.webp" }));
  expect(input("creatorAvatarUrl").value).toBe(creator.avatarUrl);
  expect(input("creatorAvatarStorageKey").value).toBe(creator.avatarStorageKey);
});

it("lets an admin edit existing mirrored profiles and upload a new picture in Preview", async () => {
  const save = await render(undefined, [{ ...creator, recordOrigin: "mirrored" }], true); await open();
  for (const name of ["creatorName", "creatorUsername", "creatorHandle", "creatorUrl", "creatorXProfileUrl", "creatorAvatarUrl"]) expect(input(name).readOnly).toBe(false);
  expect(button("Save creator").disabled).toBe(false);
  await change("creatorName", "Edited mirror"); await change("creatorUsername", "edited_mirror");
  const photoInput = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(photoInput).not.toBeNull();
  Object.defineProperty(photoInput, "files", { configurable: true, value: [new File(["image"], "new-profile.png", { type: "image/png" })] });
  await act(async () => photoInput.dispatchEvent(new Event("change", { bubbles: true })));
  await submit();
  expect(parseAdminCreatorForm(save.mock.calls[0][1])).toMatchObject({ id: creator.id, name: "Edited mirror", username: "edited_mirror", avatarUrl: "https://media.example.com/creators/new.webp", avatarStorageKey: "creators/new.webp" });
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
