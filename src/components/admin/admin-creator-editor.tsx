"use client";

import { MediaUploadButton } from "@/components/admin/media-upload-button";
import type { UploadedAdminMedia } from "@/features/admin/media-upload";
import type {
  AdminCreatorInput,
  AdminCreatorRecord,
} from "@/features/admin/types";

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";
const labelClass = "grid gap-2 text-sm font-medium text-[#333]";

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
}: {
  creator: AdminCreatorInput;
  creators: AdminCreatorRecord[];
  onChange: (creator: AdminCreatorInput) => void;
}) {
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
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[#888]">
            Attribution
          </p>
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
              <option key={item.id} value={item.id}>{item.name}</option>
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
              onUploaded={applyUploadedAvatar}
            />
          </div>
        </div>
      </section>
    </>
  );
}
