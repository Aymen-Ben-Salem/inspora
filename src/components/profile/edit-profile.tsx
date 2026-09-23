"use client";

import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  completeOwnAvatarUpload,
  createOwnAvatarUploadSignature,
  discardOwnAvatarUpload,
  updateOwnProfile,
} from "@/features/profiles/actions";
import { optimizeStaticImage } from "@/features/admin/image-optimization";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/features/admin/media-upload";
import type { CreatorProfile } from "@/features/creators/types";

import { refreshViewerProfile } from "./use-viewer-profile";

type Provider = "google" | "x";

function providerAccount(user: NonNullable<ReturnType<typeof useUser>["user"]>, provider: Provider) {
  return user.verifiedExternalAccounts.find((account) => {
    const slug = account.providerSlug();
    return provider === "google" ? slug === "google" : slug === "x" || slug === "twitter";
  });
}

function hasAlternativeSignIn(
  user: NonNullable<ReturnType<typeof useUser>["user"]>,
  excluding: string,
) {
  return Boolean(
    user.passwordEnabled ||
      user.primaryEmailAddress?.verification.status === "verified" ||
      user.primaryPhoneNumber?.verification.status === "verified" ||
      user.verifiedExternalAccounts.some((account) => account.id !== excluding),
  );
}

export function EditProfile({
  profile,
  onSaved,
  onDirtyChange,
}: {
  profile: CreatorProfile;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string }>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connecting, setConnecting] = useState<Provider>();
  const [editing, setEditing] = useState<"name" | "username" | "websiteUrl" | null>(null);
  const [savedValues, setSavedValues] = useState({ name: profile.name, username: profile.username, websiteUrl: profile.websiteUrl ?? "" });
  const dirty = name !== savedValues.name || username !== savedValues.username || websiteUrl !== savedValues.websiteUrl;

  function markDirty() {
    onDirtyChange(true);
  }

  async function save() {
    setSaving(true);
    setFieldError(undefined);
    try {
      const result = await updateOwnProfile({
        ...(name !== savedValues.name ? { name } : {}),
        ...(username !== savedValues.username ? { username } : {}),
        ...(websiteUrl !== savedValues.websiteUrl ? { websiteUrl } : {}),
      });
      if (!result.ok) {
        setFieldError({ field: result.field, message: result.message });
        return;
      }
      refreshViewerProfile();
      setSavedValues({ name, username, websiteUrl });
      setEditing(null);
      onDirtyChange(false);
      router.refresh();
      onSaved();
    } catch {
      setFieldError({ field: "form", message: "Your profile could not be saved. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setFieldError(undefined);
    if (!(["image/jpeg", "image/png"].includes(file.type)) || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setFieldError({ field: "avatar", message: "Choose one JPG or PNG image up to 10 MB." });
      return;
    }
    setUploading(true);
    let storageKey: string | undefined;
    try {
      const [optimized] = await optimizeStaticImage(file, "creator-avatar");
      if (!optimized) throw new Error("The photo could not be optimized.");
      const signature = await createOwnAvatarUploadSignature({
        fileName: file.name,
        sourceContentType: file.type,
        contentType: optimized.file.type,
        size: optimized.file.size,
      });
      if (!signature.ok) throw new Error(signature.message);
      storageKey = signature.storageKey;
      const response = await fetch(signature.uploadUrl, {
        method: signature.method,
        headers: signature.headers,
        body: optimized.file,
      });
      if (!response.ok) throw new Error("The storage service rejected the photo.");
      const completed = await completeOwnAvatarUpload({
        fileName: file.name,
        sourceContentType: file.type,
        contentType: optimized.file.type,
        size: optimized.file.size,
        storageKey,
      });
      if (!completed.ok) throw new Error(completed.message);
      storageKey = undefined;
      setAvatarUrl(completed.avatarUrl);
      refreshViewerProfile();
      router.refresh();
    } catch (error) {
      if (storageKey) await discardOwnAvatarUpload(storageKey).catch(() => undefined);
      setFieldError({
        field: "avatar",
        message: error instanceof Error ? error.message : "The photo could not be uploaded.",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function connect(provider: Provider) {
    if (!user) return;
    if (dirty && !window.confirm("Continue without saving your profile changes?")) return;
    setConnecting(provider);
    setFieldError(undefined);
    try {
      const account = await user.createExternalAccount({
        strategy: provider === "google" ? "oauth_google" : "oauth_x",
        redirectUrl: `${window.location.origin}/profile?modal=edit`,
      });
      const redirectUrl = account.verification?.externalVerificationRedirectURL;
      if (redirectUrl) window.location.assign(redirectUrl.toString());
      else await user.reload();
    } catch (error) {
      setFieldError({ field: "connections", message: error instanceof Error ? error.message : "The account could not be connected." });
    } finally {
      setConnecting(undefined);
    }
  }

  async function disconnect(provider: Provider) {
    if (!user) return;
    const account = providerAccount(user, provider);
    if (!account || !hasAlternativeSignIn(user, account.id)) return;
    setConnecting(provider);
    try {
      await account.destroy();
      await user.reload();
      router.refresh();
    } catch (error) {
      setFieldError({ field: "connections", message: error instanceof Error ? error.message : "The account could not be disconnected." });
    } finally {
      setConnecting(undefined);
    }
  }

  const inputClass = "focus-ring mt-1 h-10 w-full min-w-0 rounded-lg border border-[#e6e6e6] bg-[#fcfcfc] px-3 text-sm text-[#262626]";
  const actionClass = "focus-ring shrink-0 cursor-pointer border border-[#e6e6e6] bg-[#fafafa] px-[11px] py-[10px] text-sm leading-[normal] tracking-[0.2px] disabled:cursor-not-allowed disabled:opacity-60";
  const editActionClass = `${actionClass} transition-colors hover:border-[#262626] hover:bg-[#262626] hover:text-white`;

  return (
    <div className="text-sm leading-[normal] tracking-[0.2px]">
      <p className="mt-2 pb-[18px] text-sm tracking-[-0.28px] text-[#767676]">This is what people see on your public profile.</p>
      <div className="divide-y divide-[#f0f0f0] border-t border-[#f0f0f0]">
        <div className="flex items-center justify-between gap-3 px-0 py-[18px] sm:px-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-[68px] w-16 shrink-0 overflow-hidden rounded-full">
              <Image src={avatarUrl} alt="Your profile photo" fill sizes="64px" className="object-cover" />
            </div>
            <div className="grid gap-1">
              <p className="font-medium">Profile photo</p>
              <p className="text-xs text-[#767676]">JPG or PNG. Automatically optimized.</p>
            </div>
          </div>
          <label className={`focus-within:ring-2 focus-within:ring-black ${editActionClass}`}>
            <input aria-label="Edit profile photo" ref={fileRef} type="file" accept="image/jpeg,image/png" disabled={uploading} className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }} />
            {uploading ? "Uploading…" : "Edit"}
          </label>
        </div>
        {fieldError?.field === "avatar" ? <p role="alert" className="px-4 py-2 text-xs text-red-700">{fieldError.message}</p> : null}
        {([
          { field: "name", label: "Name", value: name, set: setName, display: savedValues.name },
          { field: "username", label: "Username", value: username, set: setUsername, display: `@${savedValues.username}` },
          { field: "websiteUrl", label: "Website", value: websiteUrl, set: setWebsiteUrl, display: savedValues.websiteUrl || "Add your website" },
        ] as const).map(({ field, label, value, set, display }) => (
          <div key={field} className="px-0 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                {editing === field ? (
                  <label className="block text-xs text-[#767676]">{label}
                    <input autoFocus value={value} type={field === "websiteUrl" ? "url" : "text"} maxLength={field === "username" ? 30 : field === "name" ? 80 : 2048}
                      onChange={(event) => { set(event.target.value); markDirty(); }} className={inputClass} aria-invalid={fieldError?.field === field} />
                  </label>
                ) : (
                  <div className="grid gap-1"><p className="text-xs text-[#767676]">{label}</p><p className="break-words font-medium">{display}</p></div>
                )}
              </div>
              <button type="button" aria-label={editing === field ? `Finish editing ${label.toLowerCase()}` : `Edit ${label.toLowerCase()}`} disabled={saving || uploading} onClick={() => { setEditing(editing === field ? null : field); setFieldError(undefined); }} className={editActionClass}>
                {editing === field ? "Back" : "Edit"}
              </button>
            </div>
            {fieldError?.field === field ? <p role="alert" className="mt-2 text-xs text-red-700">{fieldError.message}</p> : null}
          </div>
        ))}
        <div>
          {(["google", "x"] as const).map((provider) => {
            const account = user ? providerAccount(user, provider) : undefined;
            const canDisconnect = Boolean(user && account && hasAlternativeSignIn(user, account.id));
            return (
              <div key={provider} className="flex min-h-[63px] items-center justify-between gap-4 border-b border-[#f0f0f0] px-0 py-3 last:border-b-0 sm:px-4">
                <div className="flex items-center gap-3">
                  {provider === "google" ? <span className="grid size-6 place-items-center rounded-full bg-[#fafafa]"><Image src="/icons/profile/google.png" alt="" width={12} height={12} className="size-3" /></span> : <Image src="/icons/profile/x-account.svg" alt="" width={24} height={24} className="size-6" />}
                  <span className="font-medium">{provider === "google" ? "Google" : "X"}</span>
                </div>
                <button type="button" disabled={connecting !== undefined || uploading || saving || !user || Boolean(account && !canDisconnect)}
                  aria-label={account ? `${provider === "google" ? "Google" : "X"} connected${canDisconnect ? "; disconnect" : ""}` : `Connect ${provider === "google" ? "Google" : "X"}`}
                  title={account && canDisconnect ? "Disconnect account" : undefined}
                  onClick={() => { if (!account || window.confirm(`Disconnect ${provider === "google" ? "Google" : "X"} from your account?`)) void (account ? disconnect(provider) : connect(provider)); }}
                  className={account ? "focus-ring px-[11px] py-[10px] text-[#767676] enabled:cursor-pointer enabled:hover:text-[#262626]" : actionClass}>
                  {connecting === provider ? "Working…" : account ? "Connected" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
        {fieldError?.field === "connections" ? <p role="alert" className="mt-2 text-sm text-red-700">{fieldError.message}</p> : null}
      </div>
      {fieldError?.field === "form" ? <p role="alert" className="mt-3 text-sm text-red-700">{fieldError.message}</p> : null}
      {dirty ? <div className="mt-4 flex justify-end"><button type="button" disabled={saving || uploading} onClick={() => void save()} className="focus-ring h-11 cursor-pointer rounded-lg bg-[#262626] px-5 text-sm font-medium text-white hover:bg-black disabled:opacity-55">
        {saving ? "Saving…" : "Save changes"}
      </button></div> : null}
    </div>
  );
}
