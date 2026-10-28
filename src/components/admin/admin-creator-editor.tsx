"use client";

import Image from "next/image";
import { CreatorPicker } from "./creator-picker";

import { MediaUploadButton } from "@/components/admin/media-upload-button";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import type {
  AdminCreatorAttribution,
  AdminCreatorInput,
} from "@/features/admin/types";

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid min-w-0 gap-2 text-sm font-medium text-[#333]";
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
    legacyHandle: "",
    username: "",
    url: "",
    xProfileUrl: "",
    avatarUrl: "/brand/default-avatar.svg",
  };
}

export function toAdminCreatorDraft(
  creator: AdminCreatorAttribution,
): AdminCreatorInput {
  return {
    id: creator.id,
    name: creator.name,
    legacyHandle: creator.legacyHandle ?? "",
    username: creator.username ?? "",
    url: creator.url ?? "",
    xProfileUrl: creator.xProfileUrl ?? "",
    avatarUrl: creator.avatarUrl,
    avatarStorageProvider: creator.avatarStorageProvider,
    avatarStorageKey: creator.avatarStorageKey,
    recordOrigin: creator.recordOrigin,
  };
}

export function AdminCreatorEditor({
  creator,
  creators,
  onChange,
  lockExistingCreators = false,
  showCreatorPicker = true,
  readOnly = false,
  onEdit,
}: {
  creator: AdminCreatorInput;
  creators: AdminCreatorAttribution[];
  onChange: (creator: AdminCreatorInput) => void;
  lockExistingCreators?: boolean;
  showCreatorPicker?: boolean;
  readOnly?: boolean;
  onEdit?: () => void;
}) {
  const isExistingLocked =
    lockExistingCreators &&
    Boolean(creator.id) &&
    creator.recordOrigin !== "preview";
  const isReadOnly = readOnly || isExistingLocked;
  const hasVerifiedXIdentity = Boolean(
    creator.id && creators.find((item) => item.id === creator.id)?.xProviderId,
  );

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
        name="creatorRecordOrigin"
        value={creator.recordOrigin ?? ""}
      />
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

      <section className="grid min-w-0 gap-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#888]">
              Attribution
            </p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">
              Creator profile
            </h2>
          </div>
          <div className="grid justify-items-start gap-3 sm:justify-items-end">
            <p className="max-w-sm text-xs leading-relaxed text-[#777] sm:text-right">
              {readOnly
                ? "Use Edit creator to update this profile."
                : isExistingLocked
                  ? "Existing creator profiles are read-only in Preview."
                  : "Changes to an existing creator update every item connected to them."}
            </p>
            {onEdit ? (
              <button type="button" onClick={onEdit} className="focus-ring cursor-pointer rounded-full bg-[#262626] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f3f3f]">
                Edit creator
              </button>
            ) : null}
          </div>
        </div>

        {showCreatorPicker ? <CreatorPicker creators={creators} selectedId={creator.id} onSelect={selectCreator} /> : null}

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

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {!isReadOnly ? (
              <div className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium text-[#333]">Profile picture</span>
                <MediaUploadButton
                  kind="creator-avatar"
                  label="Upload new photo"
                  onUploaded={applyUploadedAvatar}
                />
                <p className="text-xs leading-relaxed text-[#777]">Upload a photo, or use the avatar URL below.</p>
              </div>
            ) : null}
            <label className={labelClass}>
              Creator name
              <input
                className={inputClass}
                name="creatorName"
                required
                readOnly={isReadOnly}
                value={creator.name}
                onChange={(event) => updateCreator("name", event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Legacy handle
              <input
                className={inputClass}
                name="creatorHandle"
                placeholder="@studio"
                readOnly={isReadOnly}
                value={creator.legacyHandle ?? ""}
                onChange={(event) => updateCreator("legacyHandle", event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Profile username
              <input
                className={inputClass}
                name="creatorUsername"
                placeholder="studio_name"
                pattern="[a-z0-9_]{3,30}"
                readOnly={isReadOnly}
                value={creator.username ?? ""}
                onChange={(event) => updateCreator("username", event.target.value)}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Website
              <input
                className={inputClass}
                name="creatorUrl"
                type="url"
                readOnly={isReadOnly}
                value={creator.url ?? ""}
                onChange={(event) => updateCreator("url", event.target.value)}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              X profile URL
              <input
                className={inputClass}
                name="creatorXProfileUrl"
                type="url"
                placeholder="https://x.com/studio"
                readOnly={isReadOnly || hasVerifiedXIdentity}
                value={creator.xProfileUrl ?? ""}
                onChange={(event) => updateCreator("xProfileUrl", event.target.value)}
              />
            </label>
            {hasVerifiedXIdentity && !isReadOnly ? (
              <p className="text-xs leading-relaxed text-[#777] sm:col-span-2">
                This link belongs to a verified X identity. To change it, the creator must update their connected X account.
              </p>
            ) : null}
            <label className={`${labelClass} sm:col-span-2`}>
              Avatar URL or local path
              <input
                className={inputClass}
                name="creatorAvatarUrl"
                required
                readOnly={isReadOnly}
                placeholder="/brand/default-avatar.svg"
                value={creator.avatarUrl}
                onChange={(event) => updateCreator("avatarUrl", event.target.value)}
              />
            </label>
            {isExistingLocked && !readOnly ? (
              <p className="text-xs leading-relaxed text-[#777] sm:col-span-2">
                Choose &quot;Create a new creator&quot; to enter a different profile or upload a new avatar.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
