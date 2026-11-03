"use client";

import { useActionState, useState } from "react";
import { CampaignPreview } from "@/components/sponsorship/campaign-preview";
import type { CampaignDisplayAsset } from "@/components/sponsorship/campaign-display-asset";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import type { AdminActionState, AdminSponsorInput, AdminSponsorRecord } from "@/features/admin/types";
import { initialAdminActionState } from "@/features/admin/types";
import { fetchWebsiteMetadataAction } from "@/features/admin/website-metadata";
import { preserveFormDraft } from "./preserve-form-draft";
import { AdminSponsorUpload } from "./sponsor-upload";

const inputClass = "focus-ring min-h-11 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm placeholder:text-[#aaa]";
const labelClass = "grid gap-2 text-sm text-[#333]";
const hiddenFields = ["id", "mediaType", "mediaUrl", "mediaPosterUrl", "mediaStorageProvider", "mediaStorageKey", "mediaPosterStorageKey", "mediaWidth", "mediaHeight", "mediaVideoPreview", "mediaVariants", "iconUrl", "iconStorageProvider", "iconStorageKey", "wordmarkUrl", "wordmarkStorageKey", "isActive"] as const;
type UploadRole = "media" | "icon" | "wordmark";

function blankSponsor(): AdminSponsorInput {
  return { title: "", url: "", tagline: "", mediaType: "image", mediaWidth: 1200, mediaHeight: 800, mediaAlt: "", isActive: false };
}

function displayAsset(id: string, url?: string, contentType = "image/webp", width = 1200, height = 800): CampaignDisplayAsset | undefined {
  return url ? { id, url, contentType, width, height, sizeBytes: 0 } : undefined;
}

export function SponsorEditor({ action, sponsor, deleteAction }: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  sponsor?: AdminSponsorRecord | null;
  deleteAction?: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialAdminActionState);
  const [values, setValues] = useState<AdminSponsorInput>(() => sponsor ?? blankSponsor());
  const [fetching, setFetching] = useState(false), [metadataMessage, setMetadataMessage] = useState("");
  const [uploads, setUploads] = useState<Partial<Record<UploadRole, boolean>>>({});
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState("");
  const uploading = Object.values(uploads).some(Boolean), busy = isPending || deleting;
  function update<K extends keyof AdminSponsorInput>(field: K, value: AdminSponsorInput[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }
  async function suggest() {
    if (!values.url || fetching) return;
    setFetching(true); setMetadataMessage("");
    try {
      const result = await fetchWebsiteMetadataAction(values.url);
      if (!result.ok) { setMetadataMessage(result.message); return; }
      const data = result.data;
      setValues((previous) => ({
        ...previous, title: previous.title || (data.title || data.hostname).slice(0, 160),
        tagline: previous.tagline || data.description?.slice(0, 300) || "",
        iconUrl: previous.iconUrl || data.icon || "", mediaUrl: previous.mediaUrl || data.image || "",
        mediaAlt: previous.mediaAlt || (data.title || "").slice(0, 300),
      }));
      setMetadataMessage("Suggestions added to empty fields. Review them before saving.");
    } catch { setMetadataMessage("Could not read this website. You can still enter the details yourself."); }
    finally { setFetching(false); }
  }

  function uploaded(role: UploadRole, media: UploadedAdminMedia) {
    setValues((previous) => {
      if (role === "icon") return { ...previous, iconUrl: media.url, iconStorageProvider: media.storageProvider, iconStorageKey: media.storageKey };
      if (role === "wordmark") return { ...previous, wordmarkUrl: media.url, wordmarkStorageKey: media.storageKey };
      return { ...previous, mediaType: media.type, mediaUrl: media.url, mediaPosterUrl: media.posterUrl ?? "",
        mediaStorageProvider: media.storageProvider, mediaStorageKey: media.storageKey, mediaPosterStorageKey: media.posterStorageKey,
        mediaWidth: media.width, mediaHeight: media.height, mediaVariants: media.variants, mediaVideoPreview: media.videoPreview,
        mediaAlt: previous.mediaAlt || media.alt };
    });
  }
  function clear(role: UploadRole) {
    setValues((previous) => {
      if (role === "icon") return { ...previous, iconUrl: "", iconStorageProvider: undefined, iconStorageKey: undefined };
      if (role === "wordmark") return { ...previous, wordmarkUrl: "", wordmarkStorageKey: undefined };
      return { ...previous, mediaUrl: "", mediaType: "image", mediaPosterUrl: "", mediaStorageProvider: undefined,
        mediaStorageKey: undefined, mediaPosterStorageKey: undefined, mediaVideoPreview: undefined, mediaVariants: [] };
    });
  }
  const assets = [
    displayAsset("icon", values.iconUrl, "image/webp", 128, 128),
    displayAsset("wordmark", values.wordmarkUrl, "image/webp", 448, 72),
    displayAsset("media", values.mediaUrl, values.mediaType === "video" ? "video/mp4" : "image/webp", values.mediaWidth, values.mediaHeight),
    displayAsset("poster", values.mediaPosterUrl),
    values.mediaVideoPreview ? { ...displayAsset("video", values.mediaVideoPreview.url, "video/mp4", values.mediaVideoPreview.width, values.mediaVideoPreview.height)!, sizeBytes: values.mediaVideoPreview.bytes } : undefined,
  ].filter((asset): asset is CampaignDisplayAsset => Boolean(asset));
  const upload = (role: UploadRole, label: string, kind: "sponsor-media" | "sponsor-icon") => <div className="grid content-start gap-2">
    <AdminSponsorUpload label={label} kind={kind} asset={assets.find((asset) => asset.id === role)}
      disabled={busy || fetching} onUploaded={(media) => uploaded(role, media)}
      onBusyChange={(value) => setUploads((previous) => ({ ...previous, [role]: value }))} />
    {assets.some((asset) => asset.id === role) ? <button type="button" disabled={busy || uploading || fetching} onClick={() => clear(role)}
      className="focus-ring justify-self-start text-xs text-[#b42318] hover:underline disabled:opacity-50">Remove {label.toLowerCase()}</button> : null}
  </div>;

  return <form ref={preserveFormDraft} action={formAction} className="grid gap-6">
    {state.status === "error" && state.message ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">{state.message}</p> : null}
    {hiddenFields.map((field) => <input key={field} type="hidden" name={field}
      value={typeof values[field] === "object" ? JSON.stringify(values[field]) : String(values[field] ?? "")} />)}
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 rounded-2xl border border-black/10 bg-white p-5 sm:p-8">
        <fieldset disabled={busy} className="grid min-w-0 gap-6">
          <legend className="mb-6 text-xl font-medium tracking-tight">Campaign details</legend>
          <label className={labelClass}>Public name<input className={inputClass} name="title" required maxLength={160} placeholder="Your product" value={values.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label className={labelClass}>Website destination<input className={inputClass} type="url" name="url" required placeholder="https://your-product.com" value={values.url} onChange={(event) => update("url", event.target.value)} /></label>
          <label className={labelClass}>Short feed description<textarea className={`${inputClass} min-h-24 resize-y`} name="tagline" maxLength={300} placeholder="A short sentence about your product" value={values.tagline ?? ""} onChange={(event) => update("tagline", event.target.value)} /></label>
          <div className="grid justify-items-start gap-2">
            <button type="button" onClick={() => { void suggest(); }} disabled={!values.url || fetching || uploading}
              className="focus-ring rounded-md border border-black/10 px-4 py-3 text-sm hover:bg-[#f5f5f2] disabled:opacity-50">{fetching ? "Reading website…" : "Suggest from website"}</button>
            {metadataMessage ? <p role="status" className="text-xs text-[#777]">{metadataMessage}</p> : null}
          </div>
          <div className="grid gap-6 border-t border-black/10 pt-6">
            <h2 className="text-xl font-medium tracking-tight">Campaign media</h2>
            {upload("media", "Feed media (optional)", "sponsor-media")}
            {/* Both brand images use the existing admin static-image upload policy.
                It retains one optimized file, sufficient for the 112px wordmark. */}
            <div className="grid gap-5 sm:grid-cols-2">{upload("icon", "Compact icon", "sponsor-icon")}{upload("wordmark", "Full wordmark", "sponsor-icon")}</div>
            <label className={labelClass}>Media description<input className={inputClass} name="mediaAlt" maxLength={300} value={values.mediaAlt} placeholder="Describe the image or video" onChange={(event) => update("mediaAlt", event.target.value)} /></label>
            <details className="text-sm text-[#777]"><summary className="focus-ring cursor-pointer">Use image URLs</summary><div className="mt-4 grid gap-4">
              {([ ["iconUrl", "Compact icon URL"], ["wordmarkUrl", "Full wordmark URL"], ["mediaUrl", "Feed image URL"] ] as const).map(([field, label]) => <label key={field} className={labelClass}>{label}<input className={inputClass} type="url" disabled={uploading || fetching} value={values[field] ?? ""} onChange={(event) => {
                const url = event.target.value;
                const role = field === "iconUrl" ? "icon" : field === "wordmarkUrl" ? "wordmark" : "media";
                clear(role); update(field, url);
              }} /></label>)}
            </div></details>
          </div>
          <div className="grid gap-4 border-t border-black/10 pt-6">
            <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-4 accent-black" checked={values.isActive} onChange={(event) => update("isActive", event.target.checked)} />Show on the website</label>
            <p className="text-sm leading-6 text-[#777]">This manual sponsor does not require payment and stays separate from the four paid sponsor seats.</p>
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={busy || fetching || uploading || !values.title.trim() || !values.url.trim()}
                className="focus-ring min-h-11 rounded-full bg-black px-6 text-sm font-medium text-white hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-40">{isPending ? "Saving…" : "Save sponsor"}</button>
              {sponsor && deleteAction ? <button type="button" disabled={busy || uploading || fetching} className="focus-ring min-h-11 rounded-full px-4 text-sm text-[#b42318] hover:bg-red-50 disabled:opacity-40" onClick={async () => {
                if (!confirm("Remove this manual sponsor from the website?")) return;
                setDeleting(true); setDeleteError("");
                try { await deleteAction(); } catch { setDeleteError("Could not remove the sponsor. Try again."); } finally { setDeleting(false); }
              }}>{deleting ? "Removing…" : "Delete sponsor"}</button> : null}
            </div>
            {deleteError ? <p role="alert" className="text-sm text-[#b42318]">{deleteError}</p> : null}
          </div>
        </fieldset>
      </div>
      <div className="min-w-0 rounded-2xl border border-black/10 bg-white p-5 xl:sticky xl:top-24">
        <CampaignPreview fields={{ title: values.title, url: values.url, feedDescription: values.tagline ?? "", iconId: "icon", wordmarkId: "wordmark", mediaId: "media", posterId: "poster", videoPreviewId: "video" }} assets={assets} />
      </div>
    </div>
  </form>;
}
