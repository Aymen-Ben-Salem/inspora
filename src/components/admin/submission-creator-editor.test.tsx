// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminCreatorAttribution } from "@/features/admin/types";
import type { AdminSubmissionReview } from "@/features/submissions/review-service";

const mocks = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/admin/creator-actions", () => ({ saveCreatorProfileAction: mocks.save }));
vi.mock("@/features/media/prepare-and-upload", () => ({ defaultUploadOperations: {}, prepareAndUploadMedia: mocks.upload }));
import { SubmissionReview } from "./submission-review";

const creator: AdminCreatorAttribution = {
  id: "11111111-1111-4111-8111-111111111111", name: "Submitted creator", username: "submitted_creator",
  url: "https://creator.example.com", xProfileUrl: "https://x.com/creator", avatarUrl: "/avatar.svg",
  editedFields: [], recordOrigin: "user", createdAt: "2026-10-28", updatedAt: "2026-10-28",
};
const submission: AdminSubmissionReview = {
  id: "22222222-2222-4222-8222-222222222222", ownerUserId: "owner-1", creatorId: creator.id,
  creatorName: creator.name, creatorUsername: creator.username!, kind: "design", status: "in_review",
  sourceUrl: "https://example.com/work", uploadId: null, mediaType: null, mediaHref: null,
  createdAt: "2026-10-28T00:00:00Z", reviewedAt: null, rejectionReason: null, expiresAt: null, publishedRef: null,
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.save.mockReset();
  mocks.upload.mockReset();
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(kind: AdminSubmissionReview["kind"] = "design") {
  await act(async () => root.render(<SubmissionReview submission={{ ...submission, kind }} creator={creator} creators={[creator]} categories={["Product"]} acceptAction={vi.fn()} rejectAction={vi.fn()} />));
}
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === label)!;
const dialog = () => container.querySelector<HTMLDialogElement>("dialog");
async function change(field: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function save() {
  const submitter = button("Save creator");
  await act(async () => submitter.form!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter })));
}

it.each(["design", "website", "logo", "app-icon"] as const)("opens an editable creator profile from a %s review without offering a different creator", async (kind) => {
  await render(kind);
  expect(container.textContent).not.toContain("Select creator");
  expect(button("Edit creator")).toBeDefined();
  await act(async () => button("Edit creator").click());
  expect(dialog()?.open).toBe(true);
  for (const name of ["creatorName", "creatorUsername", "creatorHandle", "creatorUrl", "creatorXProfileUrl", "creatorAvatarUrl"]) {
    expect(dialog()!.querySelector<HTMLInputElement>(`[name="${name}"]`)!.readOnly).toBe(false);
  }
  expect(dialog()!.textContent).toContain("Upload new photo");
  expect(container.querySelectorAll("form form")).toHaveLength(0);
});

it.each(["design", "website", "logo", "app-icon"] as const)("saves creator details in place and preserves the %s publication draft", async (kind) => {
  await render(kind);
  const title = container.querySelector<HTMLInputElement>('[name="title"]')!;
  await change(title, "Unpublished work draft");
  const updated = { ...creator, name: "Updated creator", username: "updated_creator", avatarUrl: "/new-avatar.svg" };
  mocks.save.mockResolvedValue({ status: "idle", creator: updated });
  await act(async () => button("Edit creator").click());
  await change(dialog()!.querySelector<HTMLInputElement>('[name="creatorName"]')!, updated.name);
  await change(dialog()!.querySelector<HTMLInputElement>('[name="creatorUsername"]')!, updated.username);
  await save();
  expect(mocks.save).toHaveBeenCalledOnce();
  const data = mocks.save.mock.calls[0][1] as FormData;
  expect(data.get("creatorId")).toBe(creator.id);
  expect(data.get("creatorName")).toBe(updated.name);
  expect(dialog()).toBeNull();
  expect(container.querySelector('[name="title"]')).toBe(title);
  expect(title.value).toBe("Unpublished work draft");
  expect(container.querySelector<HTMLInputElement>('[name="creatorName"]')!.value).toBe(updated.name);
  expect(container.querySelector<HTMLInputElement>('[name="creatorUsername"]')!.value).toBe(updated.username);
  expect(container.querySelector<HTMLInputElement>('[name="creatorAvatarUrl"]')!.value).toBe(updated.avatarUrl);
  expect(container.textContent).toContain(`Submitter: ${updated.name}`);
});

it("keeps failed profile edits open for correction", async () => {
  await render();
  mocks.save.mockResolvedValue({ status: "error", message: "That username is unavailable." });
  await act(async () => button("Edit creator").click());
  await change(dialog()!.querySelector<HTMLInputElement>('[name="creatorName"]')!, "Unsaved creator");
  await save();
  expect(dialog()?.open).toBe(true);
  expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe("That username is unavailable.");
  expect(container.querySelector<HTMLInputElement>('[name="creatorName"]')!.value).toBe(creator.name);
});

it("discards canceled profile edits without changing the review creator", async () => {
  await render();
  await act(async () => button("Edit creator").click());
  await change(dialog()!.querySelector<HTMLInputElement>('[name="creatorName"]')!, "Unsaved creator");
  await act(async () => button("Cancel").click());
  expect(dialog()).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('[name="creatorName"]')!.value).toBe(creator.name);
});
