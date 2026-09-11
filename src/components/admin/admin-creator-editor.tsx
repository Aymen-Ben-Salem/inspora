"use client";

import Image from "next/image";

import { MediaUploadButton } from "@/components/admin/media-upload-button";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import type {
  AdminCreatorInput,
  AdminCreatorRecord,
} from "@/features/admin/types";

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";
function canPreviewAvatar(value: string) {
  if (value.startsWith("/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function blankAdminCreator(): AdminCreatorInput {
  return {
    name: "",
    handle: "",
    url: "",
    avatarUrl: "/brand/default-avatar.svg",
  };
}

export function toAdminCreatorDraft(creator: AdminCreatorRecord): AdminCreatorInput {
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

export function AdminCreatorEditor({
  creator,
  creators,
  onChange,
  lockExistingCreators = false,
}: {
  creator: AdminCreatorInput;
  creators: AdminCreatorRecord[];
  onChange: (creator: AdminCreatorInput) => void;
  lockExistingCreators?: boolean;
}) {
  const isExistingLocked = lockExistingCreators && Boolean(creator.id);

  function selectCreator(id: string) {
    if (id === "new") {
      onChange(blankAdminCreator());
      return;
    }
    const selected = creators.find((item) => item.id === id);
    if (selected) onChange(toAdminCreatorDraft(selected));
  }

  function updateCreator(field: keyof AdminCreatorInput, value: string) {
    const avatarChanged = field === "avatarUrl" && value !== creator.avatarUrl;
    onChange({
      ...creator,
      [field]: value,
      ...(avatarChanged
        ? { avatarStorageProvider: undefined, avatarStorageKey: undefined }
        : {}),
    });
  }

  function applyUploadedAvatar(uploaded: UploadedAdminMedia) {
    if (uploaded.type !== "image") return;
    onChange({
      ...creator,
      avatarUrl: uploaded.url,
      avatarStorageProvider: uploaded.storageProvider,
      avatarStorageKey: uploaded.storageKey,
    });
  }

  return (
    <>
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
            {isExistingLocked
              ? "Existing creator profiles are read-only in Preview."
              : "Changes to an existing creator update every item connected to them."}
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
                readOnly={isExistingLocked}
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
                readOnly={isExistingLocked}
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
                readOnly={isExistingLocked}
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
                readOnly={isExistingLocked}
                placeholder="/brand/default-avatar.svg"
                value={creator.avatarUrl}
                onChange={(event) => updateCreator("avatarUrl", event.target.value)}
              />
            </label>
            {isExistingLocked ? (
              <p className="text-xs leading-relaxed text-[#777] sm:col-span-2">
                Choose &quot;Create a new creator&quot; to enter a different profile or upload a new avatar.
              </p>
            ) : (
              <div className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium text-[#333]">
                  Or upload an avatar
                </span>
                <MediaUploadButton
                  kind="creator-avatar"
                  label="Upload avatar"
                  onUploaded={applyUploadedAvatar}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
