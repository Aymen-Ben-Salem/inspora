"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { CreatorAvatar } from "@/components/creator-avatar";
import { checkClaimUsernameAction } from "@/features/creators/claim-actions";
import { validateCreatorUsername } from "@/features/creators/validation";
import type { ClaimProfileInput } from "@/features/creators/claim-validation";
import type { ClaimUsernameAvailability, CreatorClaimPreview } from "@/features/creators/types";

export function useClaimUsernameAvailability(targetId: string, username: string, enabled: boolean) {
  const normalized = username.trim();
  const [checked, setChecked] = useState<{ username: string; targetId: string; result: ClaimUsernameAvailability }>();
  useEffect(() => {
    if (!enabled || !validateCreatorUsername(normalized).ok) return;
    let active = true;
    const timer = setTimeout(async () => {
      let result: ClaimUsernameAvailability;
      try { result = await checkClaimUsernameAction(targetId, normalized); }
      catch { result = { status: "error", message: "Couldn’t check availability. We’ll check again when you claim." }; }
      if (active) setChecked({ username: normalized, targetId, result });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [targetId, normalized, enabled]);
  if (!enabled || !validateCreatorUsername(normalized).ok) return undefined;
  return checked?.username === normalized && checked.targetId === targetId ? checked.result : { status: "checking" as const, message: "Checking availability…" };
}

function Suggestions({ field, value, preview, onChange }: {
  field: "name" | "username"; value: string; preview?: CreatorClaimPreview; onChange: (value: string) => void;
}) {
  const options = [
    { label: "From X", value: preview?.xSuggestion?.[field] },
    { label: "My current profile", value: preview?.currentProfile?.[field] },
    { label: "Creator profile", value: preview?.profile[field] },
  ].filter((option, index, all): option is { label: string; value: string } => Boolean(option.value) && all.findIndex(other => other.value === option.value) === index);
  const prefix = field === "username" ? "@" : "";
  if (options.length === 1 && options[0].value === value.trim()) return options[0].label === "From X" ? <p className="text-xs text-[#666]">Suggested from your X profile.</p> : null;
  if (!options.length) return null;
  return <div className="flex flex-wrap gap-2" role="group" aria-label={`${field === "name" ? "Name" : "Username"} suggestions`}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value.trim() === option.value}
      onClick={() => onChange(option.value)}
      className="focus-ring flex min-h-11 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-[3px] border border-[#e6e6e6] px-3 py-2 text-left text-xs leading-5 text-[#666] transition-colors hover:border-[#999] hover:text-[#262626] aria-pressed:border-[#999] aria-pressed:bg-[#f7f7f7] aria-pressed:text-[#262626]">
      <span className="min-w-0 break-words">{option.label}{option.label === "From X" ? " (suggested)" : ""}{" "}<span className="inline-block max-w-full break-all align-bottom font-medium text-[#262626]">{prefix}{option.value}</span></span>
      {value.trim() === option.value ? <Check size={13} className="shrink-0" aria-hidden="true" /> : null}
    </button>)}
  </div>;
}

export function ClaimProfileFields({ profile, preview, onChange, onBlur, errors, availability }: {
  profile: ClaimProfileInput; preview?: CreatorClaimPreview;
  onChange: (field: "name" | "username", value: string) => void;
  onBlur: (field: "name" | "username") => void;
  errors: { name?: string; username?: string };
  availability: ReturnType<typeof useClaimUsernameAvailability>;
}) {
  const result = preview?.resultingProfile;
  const usernameMessage = errors.username ?? availability?.message ?? "Use 1–30 letters, numbers, or underscores.";
  const inputClass = "focus-ring min-h-12 w-full min-w-0 rounded-[3px] border border-[#d9d9d9] bg-white px-3 py-3 text-base text-[#262626] transition-colors hover:border-[#aaa] aria-invalid:border-red-600";
  return <section aria-labelledby="claim-profile-heading" className="border-t border-[#e6e6e6] pt-6">
    <div className="mb-5 flex items-center gap-3">
      {result ? <CreatorAvatar creator={result} role="dialog" width={40} height={40} sizes="40px" className="size-10 shrink-0 rounded-full object-cover" /> : null}
      <div className="min-w-0 flex-1"><h2 id="claim-profile-heading" className="text-base font-medium">Your profile after claiming</h2><p className="mt-1 text-xs leading-5 text-[#666]">Choose your name and username. You can edit them later.</p></div>
      {preview ? <span className="shrink-0 text-xs tabular-nums text-[#666]">{preview.combinedWorkCount} {preview.combinedWorkCount === 1 ? "work" : "works"}</span> : null}
    </div>
    {preview?.xSuggestionUnavailable ? <p className="mb-5 text-sm leading-6 text-[#666]">X suggestions are unavailable right now. Choose your details below to continue.</p> : null}
    <div className="grid gap-6">
      <div className="grid gap-2">
        <label htmlFor="claim-name" className="text-sm font-medium">Name</label>
        <input id="claim-name" name="name" autoComplete="off" required maxLength={80} value={profile.name} onChange={e => onChange("name", e.target.value)} onBlur={() => onBlur("name")}
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "claim-name-error" : undefined} className={inputClass} />
        {errors.name ? <p id="claim-name-error" className="text-xs leading-5 text-red-700" aria-live="polite">{errors.name}</p> : null}
        <Suggestions field="name" value={profile.name} preview={preview} onChange={value => onChange("name", value)} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="claim-username" className="text-sm font-medium">Username</label>
        <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[#767676]">@</span>
          <input id="claim-username" name="username" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={30} value={profile.username}
            onChange={e => onChange("username", e.target.value)} onBlur={() => onBlur("username")} aria-invalid={Boolean(errors.username)} aria-describedby="claim-username-status" className={`${inputClass} pl-8`} />
        </div>
        <p id="claim-username-status" aria-live="polite" className={`flex min-h-5 items-center gap-1.5 text-xs leading-5 ${errors.username ? "text-red-700" : "text-[#666]"}`}>
          {!errors.username && availability?.status === "checking" ? <LoaderCircle size={13} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" /> : null}
          {!errors.username && availability?.status === "available" ? <Check size={13} aria-hidden="true" className="shrink-0" /> : null}{usernameMessage}
        </p>
        <Suggestions field="username" value={profile.username} preview={preview} onChange={value => onChange("username", value)} />
      </div>
    </div>
  </section>;
}
