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
    width: role === "favicon" ? 64 : 1440,
    height: role === "favicon" ? 64 : 9000,
  };
}

function mediaFor(
  website: AdminWebsiteRecord | undefined,
  role: AdminWebsiteMediaInput["role"],
) {
  return website?.media.find((media) => media.role === role) ?? blankMedia(role);
}

const suggestedLabels = [
  "Hero",
  "Overview",
  "Features",
  "Showcase",
  "Testimonials",
  "Pricing",
  "FAQ",
  "Call to action",
  "Footer",
];

function suggestSections(width: number, height: number): AdminWebsiteSectionInput[] {
  const preferredHeight = Math.max(500, Math.round(width * 0.72));
  const count = Math.min(20, Math.max(1, Math.ceil(height / preferredHeight)));
  return Array.from({ length: count }, (_, position) => {
    const top = Math.round((height * position) / count);
    const bottom = Math.round((height * (position + 1)) / count);
    return {
      label: suggestedLabels[position] ?? `Section ${position + 1}`,
      top,
      height: bottom - top,
      position,
    };
  });
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
  const [fullPage, setFullPage] = useState<MediaDraft>(mediaFor(website, "full_page"));
  const [favicon, setFavicon] = useState<MediaDraft>(mediaFor(website, "favicon"));
  const [sections, setSections] = useState<AdminWebsiteSectionInput[]>(
    website?.sections ?? [],
  );

  const media = useMemo(() => [fullPage, favicon], [favicon, fullPage]);

  function updateMedia(
    role: AdminWebsiteMediaInput["role"],
    field: keyof MediaDraft,
    value: string,
  ) {
    const setter = role === "full_page" ? setFullPage : setFavicon;
    setter((current) => ({
      ...current,
      [field]: value,
      ...(field === "url" && value !== current.url
        ? {
            storageProvider: undefined,
            storageKey: undefined,
            mimeType: undefined,
            sourceMimeType: undefined,
            sizeBytes: undefined,
          }
        : {}),
    }));
  }

  function applyUpload(role: AdminWebsiteMediaInput["role"], uploaded: UploadedAdminMedia) {
    if (uploaded.type !== "image") return;
    const next: MediaDraft = {
      role,
      url: uploaded.url,
      storageProvider: uploaded.storageProvider,
      storageKey: uploaded.storageKey,
      mimeType: uploaded.mimeType,
      sourceMimeType: uploaded.sourceMimeType,
      sizeBytes: uploaded.sizeBytes,
      alt: uploaded.alt,
      width: uploaded.width,
      height: uploaded.height,
    };
    if (role === "full_page") {
      setFullPage(next);
      if (sections.length === 0) setSections(suggestSections(uploaded.width, uploaded.height));
    } else {
      setFavicon(next);
    }
  }

  function updateSection(index: number, field: keyof AdminWebsiteSectionInput, value: string) {
    setSections((current) => current.map((section, itemIndex) =>
      itemIndex === index
        ? { ...section, [field]: field === "label" ? value : Number(value) }
        : section,
    ));
  }

  function normalizeSections(next: AdminWebsiteSectionInput[]) {
    return next.map((section, position) => ({ ...section, position }));
  }

  return (
    <form action={formAction} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="media" value={JSON.stringify(media)} />
      <input type="hidden" name="sections" value={JSON.stringify(normalizeSections(sections))} />

      <div className="grid gap-6">
        {state.status === "error" ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message}
          </p>
        ) : null}
        {website?.status === "archived" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This website is archived. Saving it will restore it.
          </p>
        ) : null}

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Content</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Website details</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              Title
              <input className={inputClass} name="title" required maxLength={200} defaultValue={website?.title} />
            </label>
            <label className={labelClass}>
              Slug
              <input className={inputClass} name="slug" required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="paper-website" defaultValue={website?.slug} />
            </label>
            <label className={labelClass}>
              Short feed description
              <input className={inputClass} name="tagline" required maxLength={300} defaultValue={website?.tagline} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Full description
              <textarea className="focus-ring min-h-32 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed outline-none focus:border-black/30" name="description" required maxLength={4000} defaultValue={website?.description} />
            </label>
            <label className={labelClass}>
              Categories
              <input className={inputClass} name="categories" required placeholder="SaaS, Portfolio" defaultValue={website?.categories.join(", ")} />
            </label>
            <label className={labelClass}>
              Themes
              <input className={inputClass} name="themes" required placeholder="Light, Editorial" defaultValue={website?.themes.join(", ")} />
            </label>
            <label className={labelClass}>
              Colours
              <input className={inputClass} name="colors" required placeholder="White, Blue" defaultValue={website?.colors.join(", ")} />
            </label>
            <label className={labelClass}>
              Live website URL
              <input className={inputClass} name="sourceUrl" type="url" required placeholder="https://" defaultValue={website?.sourceUrl} />
            </label>
          </div>
        </section>

        <AdminCreatorEditor creator={creator} creators={creators} onChange={setCreator} />

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Assets</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Screenshot and favicon</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#777]">
              Upload one full-page screenshot. Section cards reuse crops from it, so no section files are duplicated.
            </p>
          </div>
          {([
            ["full_page", fullPage, "Full-page screenshot"],
            ["favicon", favicon, "Website favicon"],
          ] as const).map(([role, item, title]) => (
            <div key={role} className="grid gap-4 rounded-2xl border border-black/10 bg-[#f7f7f4] p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="flex min-h-40 items-center justify-center overflow-hidden bg-[#ececea] p-4">
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.alt || `${title} preview`} className={role === "favicon" ? "max-h-24 max-w-24 object-contain" : "h-48 w-full object-cover object-top"} />
                ) : <span className="text-xs text-[#777]">No image yet</span>}
              </div>
              <div className="grid gap-3">
                <h3 className="font-medium">{title}</h3>
                <MediaUploadButton kind="website-media" label={`Upload ${role === "favicon" ? "favicon" : "screenshot"}`} onUploaded={(uploaded) => applyUpload(role, uploaded)} />
                <label className={labelClass}>
                  Image URL
                  <input className={inputClass} required value={item.url} onChange={(event) => updateMedia(role, "url", event.target.value)} />
                </label>
                <label className={labelClass}>
                  Alternative text
                  <input className={inputClass} required maxLength={500} value={item.alt} onChange={(event) => updateMedia(role, "alt", event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Width<input className={inputClass} type="number" min={1} max={12000} required value={item.width} onChange={(event) => updateMedia(role, "width", event.target.value)} /></label>
                  <label className={labelClass}>Height<input className={inputClass} type="number" min={1} max={60000} required value={item.height} onChange={(event) => updateMedia(role, "height", event.target.value)} /></label>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Sections</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Crop boundaries</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#777]">
                Suggestions are free and generated from the screenshot dimensions. Review the boundaries and labels before publishing.
              </p>
            </div>
            <button type="button" className="focus-ring rounded-full border border-black/10 bg-white px-4 py-2 text-sm hover:bg-[#f3f3f1]" onClick={() => setSections(suggestSections(Number(fullPage.width), Number(fullPage.height)))}>
              Suggest sections
            </button>
          </div>
          <div className="grid gap-3">
            {sections.map((section, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-black/10 bg-[#f7f7f4] p-4 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                <label className={labelClass}>Label<input className={inputClass} required value={section.label} onChange={(event) => updateSection(index, "label", event.target.value)} /></label>
                <label className={labelClass}>Top (px)<input className={inputClass} type="number" min={0} required value={section.top} onChange={(event) => updateSection(index, "top", event.target.value)} /></label>
                <label className={labelClass}>Height (px)<input className={inputClass} type="number" min={1} required value={section.height} onChange={(event) => updateSection(index, "height", event.target.value)} /></label>
                <button type="button" className="focus-ring self-end px-2 py-3 text-xs text-red-700" onClick={() => setSections((current) => normalizeSections(current.filter((_, itemIndex) => itemIndex !== index)))}>Remove</button>
              </div>
            ))}
          </div>
          <button type="button" className="focus-ring justify-self-start rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-[#f3f3f1]" onClick={() => setSections((current) => [...current, { label: `Section ${current.length + 1}`, top: 0, height: Math.min(900, Number(fullPage.height)), position: current.length }])}>
            Add section
          </button>
        </section>
      </div>

      <aside className="grid content-start gap-5 xl:sticky xl:top-24 xl:self-start">
        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5">
          <div><p className="text-xs uppercase tracking-[0.14em] text-[#888]">Publishing</p><h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Status</h2></div>
          <div className="grid grid-cols-2 gap-2">
            {(["draft", "published"] as const).map((status) => (
              <label key={status} className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-3 text-sm">
                <input type="radio" name="status" value={status} defaultChecked={(website?.status ?? "draft") === status} />
                {status === "draft" ? "Draft" : "Published"}
              </label>
            ))}
          </div>
          <button type="submit" disabled={isPending} className="focus-ring h-11 rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-[#252525] disabled:opacity-55">
            {isPending ? "Saving..." : website ? "Save changes" : "Create website"}
          </button>
          <Link href={"/admin/websites" as Route} className="focus-ring text-center text-sm text-[#777] underline-offset-4 hover:text-black hover:underline">Cancel</Link>
        </section>
      </aside>
    </form>
  );
}
