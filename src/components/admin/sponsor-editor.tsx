"use client";

import Image from "next/image";
import { useActionState, useState } from "react";

import { AdminMediaPreview } from "@/components/admin/media-preview";
import { MediaUploadButton } from "@/components/admin/media-upload-button";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import type {
  AdminActionState,
  AdminSponsorInput,
  AdminSponsorRecord,
} from "@/features/admin/types";
import { initialAdminActionState } from "@/features/admin/types";
import { fetchWebsiteMetadataAction } from "@/features/admin/website-metadata";

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";

function blankSponsor(): AdminSponsorInput {
  return {
    title: "",
    url: "",
    tagline: "",
    mediaType: "image",
    mediaUrl: "",
    mediaPosterUrl: "",
    mediaWidth: 1200,
    mediaHeight: 800,
    mediaAlt: "",
    iconUrl: "",
    isActive: true,
  };
}

export function SponsorEditor({
  action,
  sponsor,
  deleteAction,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  sponsor?: AdminSponsorRecord | null;
  deleteAction?: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialAdminActionState);
  const [formValues, setFormValues] = useState<AdminSponsorInput>(
    sponsor ?? blankSponsor(),
  );
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

  function updateField<K extends keyof AdminSponsorInput>(
    field: K,
    value: AdminSponsorInput[K],
  ) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAutoFetchMetadata() {
    if (!formValues.url || isFetchingMetadata) return;
    setIsFetchingMetadata(true);

    try {
      const res = await fetchWebsiteMetadataAction(formValues.url);
      if (res.ok && res.data) {
        setFormValues((prev) => ({
          ...prev,
          title: prev.title || res.data.title || res.data.hostname,
          tagline: prev.tagline || res.data.description || "",
          iconUrl: prev.iconUrl || res.data.icon || "",
          mediaUrl: prev.mediaUrl || res.data.image || "",
          mediaAlt: prev.mediaAlt || res.data.title || "",
        }));
      }
    } finally {
      setIsFetchingMetadata(false);
    }
  }

  function handleMediaUploaded(uploaded: UploadedAdminMedia) {
    setFormValues((prev) => ({
      ...prev,
      mediaType: uploaded.type,
      mediaUrl: uploaded.url,
      mediaPosterUrl: uploaded.posterUrl ?? "",
      mediaStorageProvider: uploaded.storageProvider,
      mediaStorageKey: uploaded.storageKey,
      mediaPosterStorageKey: uploaded.posterStorageKey,
      mediaWidth: uploaded.width,
      mediaHeight: uploaded.height,
      mediaVariants: uploaded.variants,
      mediaAlt: prev.mediaAlt || uploaded.alt,
    }));
  }

  function handleIconUploaded(uploaded: UploadedAdminMedia) {
    setFormValues((prev) => ({
      ...prev,
      iconUrl: uploaded.url,
      iconStorageProvider: uploaded.storageProvider,
      iconStorageKey: uploaded.storageKey,
    }));
  }

  return (
    <form action={formAction} className="grid gap-10">
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {state.message}
        </div>
      ) : null}

      {/* Hidden inputs to submit all fields */}
      {formValues.id ? <input type="hidden" name="id" value={formValues.id} /> : null}
      <input type="hidden" name="mediaType" value={formValues.mediaType || "image"} />
      <input type="hidden" name="mediaUrl" value={formValues.mediaUrl ?? ""} />
      <input
        type="hidden"
        name="mediaPosterUrl"
        value={formValues.mediaPosterUrl ?? ""}
      />
      <input
        type="hidden"
        name="mediaStorageProvider"
        value={formValues.mediaStorageProvider ?? ""}
      />
      <input
        type="hidden"
        name="mediaStorageKey"
        value={formValues.mediaStorageKey ?? ""}
      />
      <input
        type="hidden"
        name="mediaPosterStorageKey"
        value={formValues.mediaPosterStorageKey ?? ""}
      />
      <input type="hidden" name="mediaWidth" value={formValues.mediaWidth || 1200} />
      <input type="hidden" name="mediaHeight" value={formValues.mediaHeight || 800} />
      <input
        type="hidden"
        name="mediaVariants"
        value={JSON.stringify(formValues.mediaVariants ?? [])}
      />
      <input type="hidden" name="iconUrl" value={formValues.iconUrl ?? ""} />
      <input
        type="hidden"
        name="iconStorageProvider"
        value={formValues.iconStorageProvider ?? ""}
      />
      <input
        type="hidden"
        name="iconStorageKey"
        value={formValues.iconStorageKey ?? ""}
      />
      <input
        type="hidden"
        name="isActive"
        value={formValues.isActive ? "true" : "false"}
      />

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Form Controls */}
        <div className="grid gap-6 lg:col-span-7">
          {/* Status & General Settings */}
          <section className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-6">
              <div>
                <h2 className="text-lg font-medium tracking-tight">Sponsor Status</h2>
                <p className="text-xs text-[#777]">
                  Enable or disable displaying the sponsor across the site.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={formValues.isActive}
                  onChange={(e) => updateField("isActive", e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-7 w-12 rounded-full bg-[#e5e5e0] transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-black peer-checked:after:translate-x-5" />
              </label>
            </div>

            <div className="mt-6 grid gap-5">
              <label className={labelClass}>
                <span>Destination Website URL *</span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    name="url"
                    required
                    placeholder="https://example.com/?ref=inspora"
                    value={formValues.url}
                    onChange={(e) => updateField("url", e.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleAutoFetchMetadata}
                    disabled={!formValues.url || isFetchingMetadata}
                    className="focus-ring shrink-0 rounded-xl border border-black/10 bg-[#f5f5f2] px-4 text-xs font-medium text-[#333] transition-colors hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    {isFetchingMetadata ? "Fetching..." : "Auto-fetch"}
                  </button>
                </div>
                <span className="text-xs text-[#888]">
                  Clicking the card or header icon takes visitors to this URL in a new tab.
                </span>
              </label>

              <label className={labelClass}>
                <span>Sponsor Name / Company Title *</span>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Mobbin, Linear, Figma"
                  value={formValues.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                <div className="flex items-center justify-between">
                  <span>Tagline text under card (optional)</span>
                  <span className="text-xs text-[#999]">Optional</span>
                </div>
                <input
                  type="text"
                  name="tagline"
                  placeholder="e.g. UI/UX design reference library of top mobile & web apps."
                  value={formValues.tagline ?? ""}
                  onChange={(e) => updateField("tagline", e.target.value)}
                  className={inputClass}
                />
                <span className="text-xs text-[#888]">
                  Displays directly below the sponsored card in the feed.
                </span>
              </label>
            </div>
          </section>

          {/* Header Icon Section */}
          <section className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium tracking-tight">Header Logo Icon</h2>
                <p className="mt-1 text-xs text-[#777]">
                  Replaces &ldquo;Updated hourly&rdquo; in the header with your sponsor icon.
                </p>
              </div>
              <span className="text-xs text-[#999]">Optional</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-6">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-[#f5f5f2]">
                {formValues.iconUrl ? (
                  <Image
                    src={formValues.iconUrl}
                    alt={formValues.title || "Sponsor icon"}
                    width={64}
                    height={64}
                    unoptimized={!formValues.iconUrl.startsWith("/")}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-[#999]">No icon</span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <MediaUploadButton
                    kind="sponsor-icon"
                    label={formValues.iconUrl ? "Replace icon" : "Upload logo icon"}
                    onUploaded={handleIconUploaded}
                  />
                </div>
                <input
                  type="url"
                  placeholder="Or enter direct image/favicon URL"
                  value={formValues.iconUrl ?? ""}
                  onChange={(e) => updateField("iconUrl", e.target.value)}
                  className="focus-ring h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-xs outline-none"
                />
              </div>

              {formValues.iconUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setFormValues((prev) => ({
                      ...prev,
                      iconUrl: "",
                      iconStorageKey: undefined,
                      iconStorageProvider: undefined,
                    }))
                  }
                  className="focus-ring text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </section>

          {/* Sponsored Feed Card Media Section */}
          <section className="rounded-2xl border border-black/10 bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium tracking-tight">Feed Card Media</h2>
                <p className="mt-1 text-xs text-[#777]">
                  Upload a custom banner image/video, use the website&apos;s image, or leave empty for an automatic preview card.
                </p>
              </div>
              <span className="text-xs text-[#999]">Optional</span>
            </div>

            <div className="mt-6 grid gap-5">
              <div className="flex flex-wrap items-center gap-4">
                <MediaUploadButton
                  kind="sponsor-media"
                  label={formValues.mediaUrl ? "Replace media file" : "Upload custom media"}
                  onUploaded={handleMediaUploaded}
                />
                {formValues.mediaUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setFormValues((prev) => ({
                        ...prev,
                        mediaUrl: "",
                        mediaStorageKey: undefined,
                        mediaStorageProvider: undefined,
                        mediaVariants: [],
                      }))
                    }
                    className="focus-ring text-xs text-red-600 hover:underline"
                  >
                    Clear custom image
                  </button>
                ) : null}
              </div>

              <label className={labelClass}>
                <span>Direct Image / Open Graph URL</span>
                <input
                  type="url"
                  placeholder="https://example.com/og-image.png (or use Auto-fetch above)"
                  value={formValues.mediaUrl ?? ""}
                  onChange={(e) => updateField("mediaUrl", e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                <span>Media Alt / Accessibility Label</span>
                <input
                  type="text"
                  name="mediaAlt"
                  placeholder="e.g. Mobbin app preview"
                  value={formValues.mediaAlt}
                  onChange={(e) => updateField("mediaAlt", e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          </section>
        </div>

        {/* Right Column: Live Previews & Actions */}
        <div className="grid gap-6 lg:col-span-5">
          {/* Header Placement Live Preview */}
          <section className="rounded-2xl border border-black/10 bg-white p-6">
            <h3 className="text-sm font-medium uppercase tracking-wider text-[#777]">
              Live Preview: Header Placement
            </h3>
            <div className="mt-4 rounded-xl border border-black/10 bg-[#fafafa] p-4">
              <div className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-4 py-3 shadow-xs">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#999]">
                  Header Right
                </span>
                {formValues.isActive && formValues.iconUrl ? (
                  <div className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white shadow-xs">
                    <Image
                      src={formValues.iconUrl}
                      alt={formValues.title || "Icon"}
                      width={32}
                      height={32}
                      unoptimized={!formValues.iconUrl.startsWith("/")}
                      className="size-full rounded-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[#262626]" />
                    <span className="text-xs font-medium text-[#262626]">Updated hourly</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Feed Card Live Preview */}
          <section className="rounded-2xl border border-black/10 bg-white p-6">
            <h3 className="text-sm font-medium uppercase tracking-wider text-[#777]">
              Live Preview: Feed Card
            </h3>
            <div className="mt-4 rounded-xl border border-black/10 bg-[#fafafa] p-4">
              <div className="mx-auto max-w-[320px]">
                <div
                  className="relative overflow-hidden rounded-none border border-black/10 bg-[#111]"
                  style={{
                    aspectRatio: `${formValues.mediaWidth || 1200}/${formValues.mediaHeight || 800}`,
                  }}
                >
                  {formValues.mediaUrl ? (
                    <AdminMediaPreview
                      type={formValues.mediaType || "image"}
                      url={formValues.mediaUrl}
                      posterUrl={formValues.mediaPosterUrl}
                      alt={formValues.mediaAlt || formValues.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center bg-gradient-to-br from-[#1a1a1a] via-[#111111] to-[#0a0a0a] p-6 text-center text-white">
                      {formValues.iconUrl ? (
                        <div className="mb-3 flex size-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-2">
                          <Image
                            src={formValues.iconUrl}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized={!formValues.iconUrl.startsWith("/")}
                            className="size-full object-contain"
                          />
                        </div>
                      ) : null}
                      <span className="text-base font-semibold tracking-tight">
                        {formValues.title || "Website Preview"}
                      </span>
                      <span className="mt-0.5 text-[11px] text-white/60">
                        {formValues.url ? new URL(formValues.url || "https://example.com").hostname : "example.com"}
                      </span>
                    </div>
                  )}

                  {/* SPONSOR badge */}
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-[#262626]/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                    SPONSOR
                  </span>
                </div>

                {formValues.tagline ? (
                  <p className="mt-2 text-xs font-medium leading-snug text-[#262626]">
                    {formValues.tagline}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Save Action Card */}
          <div className="sticky top-24 rounded-2xl border border-black/10 bg-white p-6">
            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isPending || !formValues.title || !formValues.url}
                className="focus-ring flex h-12 w-full items-center justify-center rounded-full bg-black font-medium text-white transition-all hover:bg-[#252525] disabled:cursor-not-allowed disabled:bg-[#bbb]"
              >
                {isPending ? "Saving changes..." : sponsor ? "Update Sponsor" : "Save & Activate Sponsor"}
              </button>

              {deleteAction && sponsor ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete and remove this sponsor?")) {
                      void deleteAction();
                    }
                  }}
                  className="focus-ring flex h-10 w-full items-center justify-center rounded-full border border-red-200 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  Delete Sponsor
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
