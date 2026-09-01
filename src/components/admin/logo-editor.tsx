"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";

import { MediaUploadButton } from "@/components/admin/media-upload-button";
import { LOGO_KINDS } from "@/domain/logo";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import {
  initialAdminActionState,
  type AdminActionState,
  type AdminCreatorInput,
  type AdminCreatorRecord,
  type AdminLogoMediaInput,
  type AdminLogoRecord,
} from "@/features/admin/types";

type MediaDraft = Omit<AdminLogoMediaInput, "width" | "height"> & {
  width: number | string;
  height: number | string;
};

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";

function blankCreator(): AdminCreatorInput {
  return {
    name: "",
    handle: "",
    url: "",
    avatarUrl: "/brand/default-avatar.svg",
  };
}

function creatorDraft(creator: AdminCreatorRecord): AdminCreatorInput {
  return {
    id: creator.id,
    name: creator.name,
    handle: creator.handle ?? "",
    url: creator.url ?? "",
    avatarUrl: creator.avatarUrl,
    avatarStorageProvider: creator.avatarStorageProvider,
    avatarStorageKey: creator.avatarStorageKey,
  };
}

function blankMedia(): MediaDraft {
  return { url: "", alt: "", width: 1080, height: 659, variants: [] };
}

export function LogoEditor({
  action,
  creators,
  logo,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  creators: AdminCreatorRecord[];
  logo?: AdminLogoRecord;
}) {
  const [state, formAction, isPending] = useActionState(action, initialAdminActionState);
  const [creator, setCreator] = useState<AdminCreatorInput>(
    logo?.creator ? creatorDraft(logo.creator) : blankCreator(),
  );
  const [media, setMedia] = useState<MediaDraft>(logo?.media ?? blankMedia());

  function selectCreator(id: string) {
    if (id === "new") {
      setCreator(blankCreator());
      return;
    }
    const selected = creators.find((item) => item.id === id);
    if (selected) setCreator(creatorDraft(selected));
  }

  function updateCreator(field: keyof AdminCreatorInput, value: string) {
    setCreator((current) => {
      const avatarChanged = field === "avatarUrl" && value !== current.avatarUrl;
      return {
        ...current,
        [field]: value,
        ...(avatarChanged
          ? { avatarStorageProvider: undefined, avatarStorageKey: undefined }
          : {}),
      };
    });
  }

  function applyUploadedCreatorAvatar(uploaded: UploadedAdminMedia) {
    if (uploaded.type !== "image") return;
    setCreator((current) => ({
      ...current,
      avatarUrl: uploaded.url,
      avatarStorageProvider: uploaded.storageProvider,
      avatarStorageKey: uploaded.storageKey,
    }));
  }

  function updateMedia(field: keyof MediaDraft, value: string) {
    setMedia((current) => {
      const ownershipChanged = field === "url" && value !== current.url;
      return {
        ...current,
        [field]: value,
        ...(ownershipChanged
          ? {
              storageProvider: undefined,
              storageKey: undefined,
              mimeType: undefined,
              sourceMimeType: undefined,
              sizeBytes: undefined,
              variants: [],
            }
          : {}),
      };
    });
  }

  function applyUploadedLogo(uploaded: UploadedAdminMedia) {
    if (uploaded.type !== "image") return;
    setMedia({
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

  return (
    <form action={formAction} className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="media" value={JSON.stringify(media)} />
      <input type="hidden" name="creatorId" value={creator.id ?? ""} />
      <input
        type="hidden"
        name="creatorAvatarStorageProvider"
        value={creator.avatarStorageProvider ?? ""}
      />
      <input
        type="hidden"
        name="creatorAvatarStorageKey"
        value={creator.avatarStorageKey ?? ""}
      />

      <div className="grid gap-6">
        {state.status === "error" ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.message}
          </p>
        ) : null}

        {logo?.status === "archived" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This logo is archived. Saving it as a draft or publishing it will restore it.
          </p>
        ) : null}

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Content</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Logo details</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              Title
              <input
                className={inputClass}
                name="title"
                required
                maxLength={200}
                defaultValue={logo?.title}
              />
            </label>
            <label className={labelClass}>
              Slug
              <input
                className={inputClass}
                name="slug"
                required
                maxLength={120}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="paper-logo"
                defaultValue={logo?.slug}
              />
            </label>
            <label className={labelClass}>
              Content type
              <select className={inputClass} name="kind" defaultValue={logo?.kind ?? "logo"}>
                {LOGO_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === "logo" ? "Logo" : "Icon"}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Description
              <textarea
                className="focus-ring min-h-32 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-[#aaa] focus:border-black/30"
                name="description"
                required
                maxLength={4000}
                defaultValue={logo?.description}
              />
            </label>
            <label className={labelClass}>
              Industry
              <input
                className={inputClass}
                name="industry"
                required
                maxLength={120}
                placeholder="SaaS"
                defaultValue={logo?.industry}
              />
            </label>
            <label className={labelClass}>
              Shape / type
              <input
                className={inputClass}
                name="shape"
                required
                maxLength={120}
                placeholder="Symbol & text"
                defaultValue={logo?.shape}
              />
            </label>
            <label className={labelClass}>
              Colours
              <input
                className={inputClass}
                name="colors"
                required
                placeholder="Black, White"
                defaultValue={logo?.colors.join(", ")}
              />
            </label>
            <label className={labelClass}>
              Styles
              <input
                className={inputClass}
                name="styles"
                required
                placeholder="Clean, Minimal"
                defaultValue={logo?.styles.join(", ")}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Original source URL
              <input
                className={inputClass}
                name="sourceUrl"
                type="url"
                required
                placeholder="https://"
                defaultValue={logo?.sourceUrl}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Attribution</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Creator</h2>
          </div>
          <label className={labelClass}>
            Use an existing creator
            <select
              className={inputClass}
              value={creator.id ?? "new"}
              onChange={(event) => selectCreator(event.target.value)}
            >
              <option value="new">Create a new creator</option>
              {creators.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>
              Name
              <input
                className={inputClass}
                name="creatorName"
                required
                value={creator.name}
                onChange={(event) => updateCreator("name", event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Handle
              <input
                className={inputClass}
                name="creatorHandle"
                placeholder="@studio"
                value={creator.handle ?? ""}
                onChange={(event) => updateCreator("handle", event.target.value)}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Creator URL
              <input
                className={inputClass}
                name="creatorUrl"
                type="url"
                value={creator.url ?? ""}
                onChange={(event) => updateCreator("url", event.target.value)}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Avatar URL or local path
              <input
                className={inputClass}
                name="creatorAvatarUrl"
                required
                value={creator.avatarUrl}
                onChange={(event) => updateCreator("avatarUrl", event.target.value)}
              />
            </label>
            <div className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-medium text-[#333]">Or upload an avatar</span>
              <MediaUploadButton
                kind="creator-avatar"
                label="Upload avatar"
                onUploaded={applyUploadedCreatorAvatar}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Asset</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Logo image</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#777]">
              Static AVIF, JPEG, PNG, or WebP only. Transparent backgrounds are supported.
            </p>
          </div>
          <div className="grid overflow-hidden rounded-2xl border border-black/10 bg-[#f7f7f4] lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.4fr)]">
            <div className="flex min-h-64 items-center justify-center bg-[#ececea] p-8">
              {media.url ? (
                // Admins can preview a newly entered origin before Next image config changes.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.url}
                  alt={media.alt || "Logo preview"}
                  className="max-h-72 max-w-full object-contain"
                />
              ) : (
                <p className="text-sm text-[#777]">Upload or enter a URL to preview.</p>
              )}
            </div>
            <div className="grid gap-4 p-5">
              <MediaUploadButton
                kind="logo-media"
                label="Upload logo"
                onUploaded={applyUploadedLogo}
              />
              <label className={labelClass}>
                Image URL
                <input
                  className={inputClass}
                  type="text"
                  required
                  value={media.url}
                  onChange={(event) => updateMedia("url", event.target.value)}
                />
              </label>
              <label className={labelClass}>
                Alternative text
                <input
                  className={inputClass}
                  required
                  maxLength={500}
                  value={media.alt}
                  onChange={(event) => updateMedia("alt", event.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Width
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={12000}
                    required
                    value={media.width}
                    onChange={(event) => updateMedia("width", event.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Height
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={12000}
                    required
                    value={media.height}
                    onChange={(event) => updateMedia("height", event.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="grid content-start gap-5 xl:sticky xl:top-24 xl:self-start">
        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Publishing</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Status</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["draft", "published"] as const).map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 py-3 text-sm"
              >
                <input
                  type="radio"
                  name="status"
                  value={status}
                  defaultChecked={(logo?.status ?? "draft") === status}
                />
                {status === "draft" ? "Draft" : "Published"}
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="focus-ring h-11 rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-[#252525] disabled:cursor-wait disabled:opacity-55"
          >
            {isPending ? "Saving..." : logo ? "Save changes" : "Create logo"}
          </button>
          <Link
            href={"/admin/logos" as Route}
            className="focus-ring text-center text-sm text-[#777] underline-offset-4 hover:text-black hover:underline"
          >
            Cancel
          </Link>
        </section>
      </aside>
    </form>
  );
}
