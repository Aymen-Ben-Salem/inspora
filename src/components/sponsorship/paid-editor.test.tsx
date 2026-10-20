// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "owner" }),
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}));
const uploads = vi.hoisted(() => ({ prepare: vi.fn() }));
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/sponsor/campaigns" }));
vi.mock("@/features/media/prepare-and-upload", () => ({
  prepareAndUploadMedia: uploads.prepare,
}));
import { CampaignEditor } from "./campaign-editor";
import type { OwnedCampaign } from "@/features/sponsorship/types";
import type { SponsorUploadedBundle } from "./upload-operations";
import type { SponsorAssetKind, VerifiedSponsorAsset } from "@/features/sponsorship/types";
const verifiedAsset = (id: string, kind: SponsorAssetKind): VerifiedSponsorAsset => ({
  id, kind, contentType: "image/png", sizeBytes: 5, width: 64, height: 64,
  digest: "a".repeat(64), url: `/api/sponsorship/assets/${id}`,
});
async function selectFile(field: HTMLInputElement) {
  Object.defineProperty(field, "files", { configurable: true, value: [new File(["image"], "asset.png", { type: "image/png" })] });
  await act(async () => field.dispatchEvent(new Event("change", { bubbles: true })));
}
const campaign: OwnedCampaign = {
  id: "campaign",
  checkoutId: "pinned",
  versionId: "v1",
  revision: 5,
  state: "published",
  expiresAt: "",
  creative: {
    title: "Current public name",
    url: "https://current.example.com",
    tagline: "",
    feedDescription: "A focused workspace for creative teams.",
    iconId: "i",
    wordmarkId: "w",
    variantIds: [],
    assets: [],
  },
};
it("returns a new paid campaign to its sponsorship dashboard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignEditor paid={{ readonly: false }} />));
    expect(container.querySelector('a[href="/sponsor/dashboard"]')?.textContent).toContain("Back to dashboard");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("accepts a dropped asset while another role uploads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uploads.prepare.mockImplementation(() => new Promise(() => {}));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignEditor paid={{ campaign, readonly: false }} />));
    await selectFile(container.querySelector<HTMLInputElement>('input[aria-label="Compact icon"]')!);
    const file = new File(["wordmark"], "wordmark.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
    await act(async () => container.querySelector('input[aria-label="Full wordmark"]')!.closest("label")!.dispatchEvent(drop));
    expect(uploads.prepare).toHaveBeenCalledWith(file, "sponsor-wordmark", expect.anything(), expect.any(Function), expect.any(Function));
  } finally {
    await act(async () => root.unmount());
    uploads.prepare.mockReset();
    vi.unstubAllGlobals();
  }
});
it("loads a paid version without opening preparation and saves a complete optimistic edit; Cancel has no write", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, value: { ...campaign, revision: 6 } }),
  }));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(async () =>
      root.render(<CampaignEditor paid={{ campaign, readonly: false }} />),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="Your product"]',
      )?.value,
    ).toBe("Current public name");
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="feedDescription"]')?.value).toBe(campaign.creative.feedDescription);
    expect(
      container.querySelector('a[href="/sponsor/campaigns"]')?.textContent,
    ).toContain("Cancel");
    await act(async () =>
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/sponsorship/campaigns/campaign",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"expectedRevision":5'),
      }),
    );
    expect(container.textContent).toContain("Public changes saved");
    expect(fetch).toHaveBeenCalledWith(
      "/api/sponsorship/campaigns/campaign",
      expect.objectContaining({ body: expect.stringContaining(`"feedDescription":${JSON.stringify(campaign.creative.feedDescription)}`) }),
    );
    expect(navigation.refresh).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("opens older paid campaigns with a blank, required description ready to complete", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const legacy = { ...campaign, creative: { ...campaign.creative, feedDescription: undefined } };
  try {
    await act(async () => root.render(<CampaignEditor paid={{ campaign: legacy, readonly: false }} />));
    const description = container.querySelector<HTMLTextAreaElement>('textarea[name="feedDescription"]')!;
    expect(description.value).toBe("");
    expect(description.required).toBe(true);
    expect(description.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("uploads different campaign assets concurrently and keeps completed roles when they finish out of order", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const finish = new Map<string, (bundle: SponsorUploadedBundle) => void>();
  uploads.prepare.mockImplementation((_file, kind, _operations, onStatus) => {
    onStatus("uploading");
    return new Promise<SponsorUploadedBundle>((resolve) => finish.set(kind, resolve));
  });
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    options?.signal?.throwIfAborted();
    return { ok: true, json: async () => ({ ok: true, value: campaign }) };
  });
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"), root = createRoot(container);
  const input = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const disabled = (field: HTMLInputElement) => field.disabled || field.closest("fieldset")!.disabled;
  const select = async (field: HTMLInputElement) => {
    Object.defineProperty(field, "files", { configurable: true, value: [new File(["image"], "asset.png", { type: "image/png" })] });
    await act(async () => field.dispatchEvent(new Event("change", { bubbles: true })));
  };
  const bundle = (kind: "icon" | "wordmark"): SponsorUploadedBundle => {
    const asset = { id: `new-${kind}`, kind, contentType: "image/png", sizeBytes: 5, width: 64, height: 64, digest: "a".repeat(64), url: `/api/sponsorship/assets/new-${kind}` };
    return { original: { ...asset, id: `original-${kind}`, kind: "original" }, primary: asset, variants: [] };
  };
  try {
    await act(async () => root.render(<CampaignEditor paid={{ campaign, readonly: false }} />));
    const icon = input("Compact icon"), wordmark = input("Full wordmark");
    await select(icon);
    expect(disabled(icon)).toBe(true);
    expect(disabled(wordmark)).toBe(false);
    await select(wordmark);
    expect(disabled(wordmark)).toBe(true);
    expect(disabled(input("Feed image or video (optional)"))).toBe(false);
    await act(async () => finish.get("sponsor-wordmark")!(bundle("wordmark")));
    expect(disabled(wordmark)).toBe(false);
    expect(disabled(icon)).toBe(true);
    const save = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save.disabled).toBe(true);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => finish.get("sponsor-icon")!(bundle("icon")));
    expect(save.disabled).toBe(false);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(fetch.mock.lastCall![1]!.body as string)).toMatchObject({ iconId: "new-icon", wordmarkId: "new-wordmark" });
  } finally {
    await act(async () => root.unmount());
    uploads.prepare.mockReset();
    vi.unstubAllGlobals();
  }
});
it.each(["sponsor-media", "website-poster"])(
  "keeps a separately uploaded poster when %s finishes first",
  async (first) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const finish = new Map<string, (bundle: SponsorUploadedBundle) => void>();
    uploads.prepare.mockImplementation((_file, kind) => new Promise<SponsorUploadedBundle>((resolve) => finish.set(kind, resolve)));
    const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      options?.signal?.throwIfAborted();
      return { ok: true, json: async () => ({ ok: true, value: campaign }) };
    });
    vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"), root = createRoot(container);
    const video: SponsorUploadedBundle = {
      original: verifiedAsset("original-video", "original"),
      primary: { ...verifiedAsset("video", "media"), contentType: "video/mp4" },
      poster: verifiedAsset("generated-poster", "poster"),
      videoPreview: { ...verifiedAsset("preview", "video-preview"), contentType: "video/mp4" },
      variants: [],
    };
    const poster: SponsorUploadedBundle = {
      original: verifiedAsset("original-poster", "original"),
      primary: verifiedAsset("manual-poster", "poster"), variants: [],
    };
    try {
      await act(async () => root.render(<CampaignEditor paid={{ campaign, readonly: false }} />));
      await selectFile(container.querySelector<HTMLInputElement>('input[aria-label="Feed image or video (optional)"]')!);
      await selectFile(container.querySelector<HTMLInputElement>('input[aria-label="Replace video poster (optional)"]')!);
      for (const kind of [first, first === "sponsor-media" ? "website-poster" : "sponsor-media"])
        await act(async () => finish.get(kind)!(kind === "sponsor-media" ? video : poster));
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(JSON.parse(fetch.mock.lastCall![1]!.body as string)).toMatchObject({ mediaId: "video", posterId: "manual-poster", videoPreviewId: "preview" });
    } finally {
      await act(async () => root.unmount());
      uploads.prepare.mockReset();
      vi.unstubAllGlobals();
    }
  },
);
it("keeps another upload's progress and a failed field's error independent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const jobs = new Map<string, { resolve: (bundle: SponsorUploadedBundle) => void; reject: (error: Error) => void }>();
  uploads.prepare.mockImplementation((_file, kind, _operations, status) => {
    status("uploading");
    return new Promise<SponsorUploadedBundle>((resolve, reject) => jobs.set(kind, { resolve, reject }));
  });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignEditor paid={{ campaign, readonly: false }} />));
    const icon = container.querySelector<HTMLInputElement>('input[aria-label="Compact icon"]')!, wordmark = container.querySelector<HTMLInputElement>('input[aria-label="Full wordmark"]')!;
    await selectFile(icon);
    await selectFile(wordmark);
    await act(async () => jobs.get("sponsor-icon")!.reject(new Error("Icon upload failed")));
    expect(icon.disabled).toBe(false);
    expect(wordmark.disabled).toBe(true);
    expect(icon.closest("label")!.querySelector('[role="alert"]')?.textContent).toBe("Icon upload failed");
    expect(wordmark.closest("label")!.querySelector('[role="status"]')?.textContent).toContain("uploading");
    await act(async () => jobs.get("sponsor-wordmark")!.resolve({ original: verifiedAsset("original", "original"), primary: verifiedAsset("wordmark", "wordmark"), variants: [] }));
    expect(icon.closest("label")!.querySelector('[role="alert"]')?.textContent).toBe("Icon upload failed");
    expect(wordmark.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    uploads.prepare.mockReset();
    vi.unstubAllGlobals();
  }
});
