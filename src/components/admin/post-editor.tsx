"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";

import { AdminMediaPreview } from "@/components/admin/media-preview";
import { MediaUploadButton } from "@/components/admin/media-upload-button";
import { POST_CATEGORIES } from "@/domain/post";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import {
  initialAdminActionState,
  type AdminActionState,
  type AdminCreatorInput,
  type AdminCreatorRecord,
  type AdminMediaInput,
  type AdminPostRecord,
} from "@/features/admin/types";

type MediaDraft = Omit<AdminMediaInput, "width" | "height"> & {
  width: number | string;
  height: number | string;
};

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";

function blankMedia(): MediaDraft {
  return {
    type: "image",
    url: "",
    posterUrl: "",
    alt: "",
    width: 1200,
    height: 1500,
  };
}

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

function canPreviewAvatar(value: string) {
  if (value.startsWith("/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function PostEditor({
  action,
  creators,
  post,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  creators: AdminCreatorRecord[];
  post?: AdminPostRecord;
}) {
  const [state, formAction, isPending] = useActionState(action, initialAdminActionState);
  const [media, setMedia] = useState<MediaDraft[]>(
    post?.media.length ? post.media : [blankMedia()],
  );
  const [creator, setCreator] = useState<AdminCreatorInput>(
    post?.creator ? creatorDraft(post.creator) : blankCreator(),
  );

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

  function updateMedia(index: number, field: keyof MediaDraft, value: string) {
    setMedia((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const ownershipChanged = field === "url" && value !== item.url;
        return {
          ...item,
          [field]: value,
          ...(ownershipChanged
            ? {
                storageProvider: undefined,
                storageKey: undefined,
                mimeType: undefined,
                sizeBytes: undefined,
                variants: undefined,
                posterStorageKey: undefined,
              }
            : {}),
        };
      }),
    );
  }

  function applyUploadedMedia(index: number, uploaded: UploadedAdminMedia) {
    setMedia((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...uploaded } : item,
      ),
    );
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
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message}
          </p>
        ) : null}

        {post?.status === "archived" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This post is archived. Saving it as a draft or publishing it will restore it.
          </p>
        ) : null}

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Content</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Post details</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              Title
              <input className={inputClass} name="title" required maxLength={200} defaultValue={post?.title} />
            </label>
            <label className={labelClass}>
              Slug
              <input
                className={inputClass}
                name="slug"
                required
                maxLength={120}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="project-name"
                defaultValue={post?.slug}
              />
            </label>
            <label className={labelClass}>
              Category
              <select className={inputClass} name="category" defaultValue={post?.category ?? "Branding"}>
                {POST_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Description
              <textarea
                className="focus-ring min-h-32 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm outline-none transition-colors focus:border-black/30"
                name="description"
                required
                maxLength={4000}
                defaultValue={post?.description}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Original project URL
              <input className={inputClass} name="sourceUrl" type="url" required defaultValue={post?.sourceUrl} />
            </label>
          </div>
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">
                Attribution
              </p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">
                Creator profile
              </h2>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-[#777] sm:text-right">
              Changes to an existing creator update every post connected to them.
            </p>
          </div>

          <label className={labelClass}>
            Select creator
            <select
              className={inputClass}
              value={creator.id ?? "new"}
              onChange={(event) => selectCreator(event.target.value)}
            >
              <option value="new">Create a new creator</option>
              {creators.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.handle ? ` (${item.handle})` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-5 rounded-2xl bg-[#f7f7f4] p-4 sm:grid-cols-[88px_minmax(0,1fr)] sm:p-5">
            <div className="flex items-start">
              <div className="relative size-[72px] overflow-hidden rounded-full border border-black/10 bg-white">
                {canPreviewAvatar(creator.avatarUrl) ? (
                  <Image
                    src={creator.avatarUrl}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                  />
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Creator name
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
                  placeholder="/brand/default-avatar.svg"
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
          </div>
        </section>

        <section className="grid gap-6 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium tracking-[-0.03em]">Media gallery</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#777]">
                The first item becomes the cover shown in the archive.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMedia((current) => [...current, blankMedia()])}
              className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm transition-colors hover:bg-[#f3f3f3]"
            >
              Add media
            </button>
          </div>
          <div className="grid gap-5">
            {media.map((item, index) => (
              <article
                key={index}
                className="group grid overflow-hidden rounded-2xl border border-black/10 bg-[#f7f7f4] lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)]"
              >
                <AdminMediaPreview
                  type={item.type}
                  url={item.url}
                  posterUrl={item.posterUrl}
                  alt={item.alt || `Media ${index + 1} preview`}
                  controls={item.type === "video"}
                  className="aspect-[4/3] min-h-56 lg:aspect-auto lg:h-full"
                />
                <div className="grid gap-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Media {index + 1}</span>
                      {index === 0 ? (
                        <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
                          Cover
                        </span>
                      ) : null}
                      {item.storageProvider ? (
                        <span className="rounded-full bg-[#e7e7e4] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#666]">
                          {item.storageProvider === "r2" ? "R2" : "Cloudinary"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-start justify-end gap-3">
                      <MediaUploadButton
                        onUploaded={(uploaded) => applyUploadedMedia(index, uploaded)}
                      />
                      <button
                        type="button"
                        disabled={media.length === 1}
                        onClick={() =>
                          setMedia((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="focus-ring h-9 px-1 text-xs text-[#777] underline-offset-4 hover:text-black hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Type
                      <select
                        className={inputClass}
                        value={item.type}
                        disabled={Boolean(item.storageProvider)}
                        onChange={(event) => updateMedia(index, "type", event.target.value)}
                      >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                    </label>
                    <label className={`${labelClass} sm:col-span-2`}>
                      Media URL or local path
                      <input
                        className={inputClass}
                        required
                        value={item.url}
                        placeholder="https://... or /media/image.jpg"
                        onChange={(event) => updateMedia(index, "url", event.target.value)}
                      />
                    </label>
                    {item.type === "video" ? (
                      <label className={`${labelClass} sm:col-span-2`}>
                        Poster URL or local path
                        <input
                          className={inputClass}
                          value={item.posterUrl ?? ""}
                          placeholder="Recommended for video covers"
                          onChange={(event) => updateMedia(index, "posterUrl", event.target.value)}
                        />
                      </label>
                    ) : null}
                    <label className={`${labelClass} sm:col-span-2`}>
                      Alt text
                      <input
                        className={inputClass}
                        maxLength={500}
                        value={item.alt}
                        placeholder="Describe the image for accessibility"
                        onChange={(event) => updateMedia(index, "alt", event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      Width
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        max={12000}
                        value={item.width}
                        onChange={(event) => updateMedia(index, "width", event.target.value)}
                      />
                    </label>
                    <label className={labelClass}>
                      Height
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        max={12000}
                        value={item.height}
                        onChange={(event) => updateMedia(index, "height", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <aside className="grid content-start gap-5 xl:sticky xl:top-24 xl:self-start">
        <section className="grid gap-4 rounded-2xl border border-black/10 bg-white p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Curation</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Placement</h2>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f4f4f1] p-4">
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={post?.isFeatured}
              className="mt-0.5 size-4 accent-black"
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium text-[#333]">Featured</span>
              <span className="text-xs leading-5 text-[#777]">
                Show this post in the Featured view once it is published.
              </span>
            </span>
          </label>
        </section>

        <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Classification</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Tags</h2>
          </div>
          <label className={labelClass}>
            Industries
            <input className={inputClass} name="industries" placeholder="Design, Culture" defaultValue={post?.industries.join(", ")} />
          </label>
          <label className={labelClass}>
            Colors
            <input className={inputClass} name="colors" placeholder="Black, Cyan" defaultValue={post?.colors.join(", ")} />
          </label>
          <label className={labelClass}>
            Styles
            <input className={inputClass} name="styles" placeholder="Bold, Editorial" defaultValue={post?.styles.join(", ")} />
          </label>
        </section>

        <section className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5">
          <button
            type="submit"
            name="status"
            value="published"
            disabled={isPending}
            className="focus-ring h-11 rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-[#252525] disabled:cursor-wait disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save and publish"}
          </button>
          <button
            type="submit"
            name="status"
            value="draft"
            disabled={isPending}
            className="focus-ring h-11 rounded-full border border-black/10 px-5 text-sm font-medium transition-colors hover:bg-[#f3f3f3] disabled:cursor-wait disabled:opacity-50"
          >
            Save draft
          </button>
          <Link href={"/admin/posts" as Route} className="focus-ring py-2 text-center text-sm text-[#777] hover:text-black">
            Cancel
          </Link>
        </section>
      </aside>
    </form>
  );
}
