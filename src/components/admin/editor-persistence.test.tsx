// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminActionState, AdminCreatorAttribution, AdminLogoRecord, AdminPostRecord, AdminWebsiteRecord } from "@/features/admin/types";

vi.mock("@/features/admin/media-actions", () => ({
  createMediaUploadSignatureAction: vi.fn(), completeMediaUploadAction: vi.fn(),
  discardMediaUploadsAction: vi.fn(), getMediaConverterConfigurationAction: vi.fn(),
}));
vi.mock("@/features/admin/category-actions", () => ({ createCategoryAction: vi.fn() }));
vi.mock("@/features/admin/website-metadata", () => ({ fetchWebsiteMetadataAction: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));

import { PostEditor } from "./post-editor";
import { LogoEditor } from "./logo-editor";
import { WebsiteEditor } from "./website-editor";
import { SponsorEditor } from "./sponsor-editor";
import { CreatorManager } from "./creator-manager";
import { parseAdminLogoForm } from "@/features/admin/logo-validation";

type SaveAction = (state: AdminActionState, data: FormData) => Promise<AdminActionState>;
type EditorMode = "create" | "edit" | "review";
const timestamp = "2026-10-13T00:00:00Z";
const creator: AdminCreatorAttribution = {
  id: "creator-1", name: "Existing creator", username: "existing_creator",
  avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview", editedFields: [],
  createdAt: timestamp, updatedAt: timestamp,
};
const base = {
  id: "work-1", title: "Original title", slug: "original-slug", description: "Original description",
  sourceUrl: "https://example.com/original", creator, status: "draft" as const,
  createdAt: timestamp, updatedAt: timestamp,
};
const image = {
  url: "/media/work.webp", storageProvider: "r2" as const, storageKey: "logos/work.webp",
  mimeType: "image/webp", sourceMimeType: "image/png", sizeBytes: 1500,
  alt: "Uploaded image", width: 1080, height: 659,
  variants: [{ url: "/media/variant.webp", storageKey: "logos/variant.webp", width: 640, height: 390, bytes: 500, format: "webp" as const }],
};
const post: AdminPostRecord = {
  ...base, category: "Branding", industries: ["Original"], colors: ["Blue"], styles: ["Original"],
  isFeatured: false, media: [{ ...image, type: "image" }],
};
const logo: AdminLogoRecord = {
  ...base, kind: "logo", industry: "Original", shape: "Original", colors: ["Blue"], styles: ["Original"], media: image,
};
const website: AdminWebsiteRecord = {
  ...base, tagline: "Original tagline", categories: ["Original"], themes: ["Original"], colors: ["Blue"], technologies: ["React"],
  isFeatured: false, media: [{ ...image, role: "favicon" }],
};
const commonFields = {
  title: "Keep this title", slug: "keep-this-slug", description: "Keep this description", sourceUrl: "https://example.com/new-work",
  creatorName: "Keep this creator", creatorUrl: "https://example.com/creator", creatorAvatarUrl: "https://avatars.example.com/avatar.jpg",
};
const editors: Array<{
  name: string;
  fields: Record<string, string>;
  render: (action: SaveAction, mode: EditorMode) => ReactElement;
}> = [
  {
    name: "design", fields: { ...commonFields, industries: "Culture, Design", colors: "Black, Cyan", styles: "Bold, Editorial" },
    render: (action, mode) => <PostEditor action={action} creators={[]} categories={["Branding", "Web"]} post={mode === "create" ? undefined : post} publicationOnly={mode === "review"} />,
  },
  {
    name: "logo", fields: { ...commonFields, industry: "SaaS", shape: "Combination mark", colors: "Black, White", styles: "Minimal" },
    render: (action, mode) => <LogoEditor action={action} creators={[]} logo={mode === "create" ? undefined : logo} publicationOnly={mode === "review"} />,
  },
  {
    name: "website", fields: { ...commonFields, tagline: "Keep this tagline", categories: "SaaS, Portfolio", themes: "Light, Editorial", colors: "White, Blue", technologies: "React, Next.js" },
    render: (action, mode) => <WebsiteEditor action={action} creators={[]} website={mode === "create" ? undefined : website} publicationOnly={mode === "review"} />,
  },
];

const resetForm = HTMLFormElement.prototype.reset;
beforeEach(() => {
  // happy-dom 20 resets fields before firing `reset` and ignores cancellation.
  // Browsers fire this cancelable event first, as required by the HTML standard.
  vi.spyOn(HTMLFormElement.prototype, "reset").mockImplementation(function (this: HTMLFormElement) {
    if (this.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }))) resetForm.call(this);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps recording and favicon controls without section fields", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const action = vi.fn<SaveAction>().mockResolvedValue({ status: "idle" });
  try {
    await act(async () => root.render(<WebsiteEditor action={action} creators={[]} website={{
      ...website,
      media: [...website.media, { role: "recording", url: "/original.mp4", posterUrl: "/poster.webp", width: 1200, height: 800, alt: "Recording" }],
    }} />));
    expect(container.querySelector("video")?.preload).toBe("none");
    expect(container.querySelector('[name="sections"]')).toBeNull();
    expect(container.textContent).not.toContain("Add section");
    const media = JSON.parse(textField(container.querySelector("form")!, "media").value);
    expect(media).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "recording", url: "/original.mp4", posterUrl: "/poster.webp" }),
      expect.objectContaining({ role: "favicon", url: image.url }),
    ]));
  } finally { await act(async () => root.unmount()); }
});

async function enterText(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function textField(form: HTMLFormElement, name: string) {
  return form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
}

async function submit(form: HTMLFormElement) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  await act(async () => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button })));
}

for (const editor of editors) {
  it.each(["create", "edit", "review"] as const)(`retains the ${editor.name} %s draft after errors and submits corrected values on retry`, async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const submitted: FormData[] = [];
    const action = vi.fn<SaveAction>(async (_state, data) => {
      submitted.push(data);
      return { status: "error", message: submitted.length === 1 ? "Please fix the avatar URL." : "The save failed. Try again." };
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(editor.render(action, mode)));
      const form = container.querySelector("form")!;
      for (const [name, value] of Object.entries(editor.fields)) await enterText(textField(form, name), value);
      const featured = form.querySelector<HTMLInputElement>('input[name="isFeatured"]');
      if (featured) await act(async () => featured.click());
      const kind = form.querySelector<HTMLSelectElement>('select[name="kind"]');
      if (kind) await act(async () => { kind.value = "icon"; kind.dispatchEvent(new Event("change", { bubbles: true })); });
      const category = form.querySelector<HTMLSelectElement>('select[name="category"]');
      if (category) await act(async () => { category.value = "Web"; category.dispatchEvent(new Event("change", { bubbles: true })); });
      const published = form.querySelector<HTMLInputElement>('input[type="radio"][name="status"][value="published"]');
      if (published) await act(async () => published.click());
      const media = textField(form, "media").value;
      if (featured) expect(featured.checked).toBe(true);
      if (kind) expect(kind.value).toBe("icon");
      if (category) expect(category.value).toBe("Web");
      if (published) expect(published.checked).toBe(true);

      await submit(form);

      expect(action).toHaveBeenCalledOnce();
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("Please fix the avatar URL.");
      for (const [name, value] of Object.entries(editor.fields)) expect(textField(form, name).value, name).toBe(value);
      if (featured) expect(featured.checked).toBe(true);
      if (kind) expect(kind.value).toBe("icon");
      if (category) expect(category.value).toBe("Web");
      if (published) expect(published.checked).toBe(true);
      expect(textField(form, "media").value).toBe(media);

      await enterText(textField(form, "title"), "Corrected title");
      await submit(form);

      expect(action).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[role="alert"]')?.textContent).toBe("The save failed. Try again.");
      expect(textField(form, "title").value).toBe("Corrected title");
      for (const [name, value] of Object.entries(editor.fields)) expect(submitted[1].get(name), name).toBe(name === "title" ? "Corrected title" : value);
      expect(submitted[1].get("media")).toBe(media);
      expect(submitted[1].get("status")).toBe("published");
      if (featured) expect(submitted[1].get("isFeatured")).toBe("on");
      if (kind) expect(submitted[1].get("kind")).toBe("icon");
      if (category) expect(submitted[1].get("category")).toBe("Web");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
}

it("retains sponsor details and the active selection after a failed save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const action = vi.fn<SaveAction>().mockResolvedValue({ status: "error", message: "Save failed." });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorEditor action={action} />));
    const form = container.querySelector("form")!;
    await enterText(textField(form, "title"), "Keep this sponsor");
    await enterText(textField(form, "url"), "https://example.com/sponsor");
    const active = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => active.click());
    expect(active.checked).toBe(false);

    await submit(form);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Save failed.");
    expect(textField(form, "title").value).toBe("Keep this sponsor");
    expect(active.checked).toBe(false);
    expect(textField(form, "isActive").value).toBe("false");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("submits a pasted Dribbble logo through the real parser and retains it after a save error", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const url = "https://cdn.dribbble.com/users/16291758/avatars/normal/dae7978b6b70e15759d6fbd6686f64e6.jpg";
  const action = vi.fn<SaveAction>(async (_state, data) => {
    const parsed = parseAdminLogoForm(data);
    expect(parsed.media.url).toBe(url);
    expect(parsed.media.storageProvider).toBeUndefined();
    expect(parsed.media.storageKey).toBeUndefined();
    expect(parsed.media.variants).toEqual([]);
    return { status: "error", message: "The save failed. Try again." };
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<LogoEditor action={action} creators={[]} logo={{ ...logo, creator: { ...creator, id: "00000000-0000-4000-8000-000000000010" } }} />));
    const form = container.querySelector("form")!;
    const imageUrl = Array.from(form.querySelectorAll("label"))
      .find((label) => label.textContent === "Image URL")!.querySelector("input")!;
    await enterText(imageUrl, url);

    await submit(form);

    expect(action).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The save failed. Try again.");
    expect(imageUrl.value).toBe(url);
    expect(textField(form, "title").value).toBe("Original title");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("retains the creator profile details when saving returns an error", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const action = vi.fn<SaveAction>().mockResolvedValue({ status: "error", message: "Save failed." });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<CreatorManager creators={[]} claims={[]} saveAction={action} deleteAction={action} reviewAction={async () => {}} lockExistingCreators={false} />));
    const form = container.querySelector("form")!;
    await enterText(textField(form, "creatorName"), "Keep this creator");
    await enterText(textField(form, "creatorAvatarUrl"), "https://avatars.example.com/avatar.jpg");

    await submit(form);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Save failed.");
    expect(textField(form, "creatorName").value).toBe("Keep this creator");
    expect(textField(form, "creatorAvatarUrl").value).toBe("https://avatars.example.com/avatar.jpg");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
