"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  AdminCreatorEditor,
  blankAdminCreator,
  toAdminCreatorDraft,
} from "@/components/admin/admin-creator-editor";
import { MediaUploadButton } from "@/components/admin/media-upload-button";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import {
  initialAdminActionState,
  type AdminActionState,
  type AdminCreatorInput,
  type AdminCreatorRecord,
  type AdminWebsiteMediaInput,
  type AdminWebsiteRecord,
  type AdminWebsiteSectionInput,
} from "@/features/admin/types";

type MediaDraft = Omit<AdminWebsiteMediaInput, "width" | "height"> & {
  width: number | string;
  height: number | string;
};

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";

function blankMedia(role: AdminWebsiteMediaInput["role"]): MediaDraft {
  return {
    role,
    url: "",
    alt: "",
    width: role === "favicon" ? 64 : 1920,
    height: role === "favicon" ? 64 : 1080,
  };
}

function mediaFor(
  website: AdminWebsiteRecord | undefined,
  role: AdminWebsiteMediaInput["role"],
) {
  return website?.media.find((media) => media.role === role) ?? blankMedia(role);
}

function blankSection(position: number): AdminWebsiteSectionInput {
  return {
    id: crypto.randomUUID(),
    label: `Section ${position + 1}`,
    alt: "",
    url: "",
    width: 1440,
    height: 900,
    position,
  };
}

function normalizeSections(sections: AdminWebsiteSectionInput[]) {
  return sections.map((section, position) => ({ ...section, position }));
}

export function WebsiteEditor({
  action,
  creators,
  website,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  creators: AdminCreatorRecord[];
  website?: AdminWebsiteRecord;
}) {
  const [state, formAction, isPending] = useActionState(action, initialAdminActionState);
  const [creator, setCreator] = useState<AdminCreatorInput>(
    website?.creator ? toAdminCreatorDraft(website.creator) : blankAdminCreator(),
  );
  const [recording, setRecording] = useState<MediaDraft>(mediaFor(website, "recording"));
  const [favicon, setFavicon] = useState<MediaDraft>(mediaFor(website, "favicon"));
  const [sections, setSections] = useState<AdminWebsiteSectionInput[]>(
    website?.sections ?? [],
  );
  const media = useMemo(() => [recording, favicon], [favicon, recording]);

  function updateMedia(
    role: AdminWebsiteMediaInput["role"],
    field: keyof MediaDraft,
    value: string,
  ) {
    const setter = role === "recording" ? setRecording : setFavicon;
    setter((current) => ({
      ...current,
      [field]: value,
      ...(field === "url" && value !== current.url
        ? {
            posterUrl: undefined,
            storageProvider: undefined,
            storageKey: undefined,
            mimeType: undefined,
            sourceMimeType: undefined,
            sizeBytes: undefined,
            variants: undefined,
            videoPreview: undefined,
            posterStorageKey: undefined,
          }
        : {}),
    }));
  }

  function applyUpload(role: AdminWebsiteMediaInput["role"], uploaded: UploadedAdminMedia) {
    if (role === "recording" && uploaded.type !== "video") return;
    if (role === "favicon" && uploaded.type !== "image") return;
    const next: MediaDraft = {
      role,
      url: uploaded.url,
      posterUrl: uploaded.posterUrl,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      mimeType: uploaded.mimeType,
      sourceMimeType: uploaded.sourceMimeType,
      sizeBytes: uploaded.sizeBytes,
      variants: uploaded.variants,
      videoPreview: uploaded.videoPreview,
      posterStorageKey: uploaded.posterStorageKey,
      alt: uploaded.alt,
      width: uploaded.width,
      height: uploaded.height,
    };
    if (role === "recording") setRecording(next);
    else setFavicon(next);
  }

  function updateSection(
    id: string,
    updates: Partial<AdminWebsiteSectionInput>,
  ) {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, ...updates } : section)),
    );
  }

  function applySectionUpload(id: string, uploaded: UploadedAdminMedia) {
    if (uploaded.type !== "image") return;
    updateSection(id, {
      url: uploaded.url,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      mimeType: uploaded.mimeType,
      sourceMimeType: uploaded.sourceMimeType,
      sizeBytes: uploaded.sizeBytes,
      variants: uploaded.variants,
      alt: uploaded.alt,
      width: uploaded.width,
      height: uploaded.height,
    });
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return normalizeSections(next);
    });
  }

  return (
    <form action={formAction} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="media" value={JSON.stringify(media)} />
      <input type="hidden" name="sections" value={JSON.stringify(normalizeSections(sections))} />

      <div className="grid gap-6">
        {state.status === "error" ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.message}</p>
        ) : null}
        {website?.status === "archived" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This website is archived. Saving it will restore it.</p>
        ) : null}

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div><p className="text-xs uppercase tracking-[0.14em] text-[#888]">Content</p><h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Website details</h2></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>Title<input className={inputClass} name="title" required maxLength={200} defaultValue={website?.title} /></label>
            <label className={labelClass}>Slug<input className={inputClass} name="slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="paper-website" defaultValue={website?.slug} /></label>
            <label className={labelClass}>Short feed description<input className={inputClass} name="tagline" required maxLength={300} defaultValue={website?.tagline} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Full description<textarea className="focus-ring min-h-32 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed outline-none focus:border-black/30" name="description" required maxLength={4000} defaultValue={website?.description} /></label>
            <label className={labelClass}>Categories<input className={inputClass} name="categories" required placeholder="SaaS, Portfolio" defaultValue={website?.categories.join(", ")} /></label>
            <label className={labelClass}>Themes<input className={inputClass} name="themes" required placeholder="Light, Editorial" defaultValue={website?.themes.join(", ")} /></label>
            <label className={labelClass}>Colours<input className={inputClass} name="colors" required placeholder="White, Blue" defaultValue={website?.colors.join(", ")} /></label>
            <label className={labelClass}>Live website URL<input className={inputClass} name="sourceUrl" type="url" required placeholder="https://" defaultValue={website?.sourceUrl} /></label>
          </div>
        </section>

        <AdminCreatorEditor creator={creator} creators={creators} onChange={setCreator} />

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Assets</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Recording and favicon</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#777]">Upload the full MP4 or WebM recording. A silent feed preview and WebP poster are generated automatically.</p>
          </div>
          {([
            ["recording", recording, "Website recording"],
            ["favicon", favicon, "Website favicon"],
          ] as const).map(([role, item, title]) => (
            <div key={role} className="grid gap-4 rounded-2xl border border-black/10 bg-[#f7f7f4] p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="flex min-h-40 items-center justify-center overflow-hidden bg-[#ececea] p-4">
                {item.url ? role === "recording" ? (
                  <video src={item.videoPreview?.url ?? item.url} poster={item.posterUrl} muted playsInline className="aspect-video size-full object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.alt || `${title} preview`} className="max-h-24 max-w-24 object-contain" />
                ) : <span className="text-xs text-[#777]">No {role} yet</span>}
              </div>
              <div className="grid gap-3">
                <h3 className="font-medium">{title}</h3>
                <MediaUploadButton kind={role === "recording" ? "website-recording" : "website-favicon"} label={`Upload ${role}`} onUploaded={(uploaded) => applyUpload(role, uploaded)} />
                <label className={labelClass}>{role === "recording" ? "Original video URL" : "Image URL"}<input className={inputClass} required value={item.url} onChange={(event) => updateMedia(role, "url", event.target.value)} /></label>
                <label className={labelClass}>Alternative text<input className={inputClass} required maxLength={500} value={item.alt} onChange={(event) => updateMedia(role, "alt", event.target.value)} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Width<input className={inputClass} type="number" min={1} max={12000} required value={item.width} onChange={(event) => updateMedia(role, "width", event.target.value)} /></label>
                  <label className={labelClass}>Height<input className={inputClass} type="number" min={1} max={12000} required value={item.height} onChange={(event) => updateMedia(role, "height", event.target.value)} /></label>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Sections</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Independent section images</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#777]">Upload 1–30 complete images. Their order, labels, and alternative text are saved independently from the recording.</p>
            </div>
            <button type="button" disabled={sections.length >= 30} className="focus-ring rounded-full border border-black/10 bg-white px-4 py-2 text-sm hover:bg-[#f3f3f1] disabled:opacity-50" onClick={() => setSections((current) => [...current, blankSection(current.length)])}>Add section</button>
          </div>
          <div className="grid gap-4">
            {sections.map((section, index) => (
              <div key={section.id} className="grid gap-4 rounded-xl border border-black/10 bg-[#f7f7f4] p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="flex min-h-40 items-center justify-center overflow-hidden bg-[#ececea]">
                  {section.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={section.url} alt={section.alt} className="size-full object-contain" />
                  ) : <span className="text-xs text-[#777]">No image yet</span>}
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Section {index + 1}</h3><div className="flex gap-2"><button type="button" disabled={index === 0} className="text-xs disabled:opacity-30" onClick={() => moveSection(index, -1)}>Move up</button><button type="button" disabled={index === sections.length - 1} className="text-xs disabled:opacity-30" onClick={() => moveSection(index, 1)}>Move down</button><button type="button" className="text-xs text-red-700" onClick={() => setSections((current) => normalizeSections(current.filter((item) => item.id !== section.id)))}>Remove</button></div></div>
                  <MediaUploadButton kind="website-section" label="Upload section image" onUploaded={(uploaded) => applySectionUpload(section.id, uploaded)} />
                  <label className={labelClass}>Label<input className={inputClass} required maxLength={120} value={section.label} onChange={(event) => updateSection(section.id, { label: event.target.value })} /></label>
                  <label className={labelClass}>Alternative text<input className={inputClass} required maxLength={500} value={section.alt} onChange={(event) => updateSection(section.id, { alt: event.target.value })} /></label>
                  <label className={labelClass}>Image URL<input className={inputClass} required value={section.url} onChange={(event) => updateSection(section.id, { url: event.target.value, storageProvider: undefined, storageKey: undefined, mimeType: undefined, sourceMimeType: undefined, sizeBytes: undefined, variants: undefined })} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Width<input className={inputClass} type="number" min={1} max={12000} required value={section.width} onChange={(event) => updateSection(section.id, { width: Number(event.target.value) })} /></label><label className={labelClass}>Height<input className={inputClass} type="number" min={1} max={12000} required value={section.height} onChange={(event) => updateSection(section.id, { height: Number(event.target.value) })} /></label></div>
                </div>
              </div>
            ))}
          </div>
          {sections.length === 0 ? <p className="text-sm text-amber-800">Add at least one section before saving.</p> : null}
        </section>
      </div>

      <aside className="grid content-start gap-5 xl:sticky xl:top-24 xl:self-start">
        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5">
          <div><p className="text-xs uppercase tracking-[0.14em] text-[#888]">Publishing</p><h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Status</h2></div>
          <div className="grid grid-cols-2 gap-2">{(["draft", "published"] as const).map((status) => <label key={status} className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-3 text-sm"><input type="radio" name="status" value={status} defaultChecked={(website?.status ?? "draft") === status} />{status === "draft" ? "Draft" : "Published"}</label>)}</div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 px-3 py-3 text-sm"><input type="checkbox" name="isFeatured" defaultChecked={website?.isFeatured} />Feature this website</label>
          <button type="submit" disabled={isPending} className="focus-ring h-11 rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-[#252525] disabled:opacity-55">{isPending ? "Saving..." : website ? "Save changes" : "Create website"}</button>
          <Link href={"/admin/websites" as Route} className="focus-ring text-center text-sm text-[#777] underline-offset-4 hover:text-black hover:underline">Cancel</Link>
        </section>
      </aside>
    </form>
  );
}