"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
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
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [usedChoices, setUsedChoices] = useState(false);
  const options = [
    { label: "From X", value: preview?.xSuggestion?.[field] },
    { label: "My current profile", value: preview?.currentProfile?.[field] },
    { label: "Creator profile", value: preview?.profile[field] },
  ].filter((option, index, all): option is { label: string; value: string } => Boolean(option.value) && all.findIndex(other => other.value === option.value) === index);
  const prefix = field === "username" ? "@" : "";
  if (options.length === 1 && options[0].value === value.trim() && !usedChoices) return null;
  if (!options.length) return null;
  return <details ref={disclosure} className="group">
    <summary className="focus-ring flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-sm text-[#777] hover:text-[#262626] [&::-webkit-details-marker]:hidden">
      Other {field} options<ChevronDown size={14} aria-hidden="true" className="transition-transform motion-reduce:transition-none group-open:rotate-180" />
    </summary>
    <div role="group" aria-label={`${field === "name" ? "Name" : "Username"} suggestions`} className="mb-2 border-y border-black/10">
      {options.map(option => <button key={option.value} type="button" aria-pressed={value.trim() === option.value}
        aria-label={`Use ${field} ${prefix}${option.value} from ${option.label === "From X" ? "X" : option.label.toLowerCase()}`}
        onClick={() => {
          setUsedChoices(true);
          onChange(option.value);
          if (disclosure.current) disclosure.current.open = false;
          disclosure.current?.querySelector("summary")?.focus({ preventScroll: true });
        }}
        className="focus-ring flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-3 border-b border-black/10 px-3 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-[#f7f7f7]">
        <span className="min-w-0 flex-1"><span className="block break-all text-[#262626]">{prefix}{option.value}</span><span className="mt-1 block text-xs text-[#777]">{option.label}{option.label === "From X" ? " · Suggested" : ""}</span></span>
        {value.trim() === option.value ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
      </button>)}
    </div>
  </details>;
}

export function ClaimProfileFields({ profile, preview, onChange, onBlur, errors, availability }: {
  profile: ClaimProfileInput; preview?: CreatorClaimPreview;
  onChange: (field: "name" | "username", value: string) => void;
  onBlur: (field: "name" | "username") => void;
  errors: { name?: string; username?: string };
  availability: ReturnType<typeof useClaimUsernameAvailability>;
}) {
  const usernameMessage = errors.username ?? availability?.message ?? "Use 1–30 letters, numbers, or underscores.";
  const inputClass = "focus-ring min-h-12 w-full min-w-0 border border-black/15 bg-white px-3 py-3 text-base text-[#262626] transition-colors hover:border-black/40 aria-invalid:border-red-600";
  return <section aria-labelledby="claim-profile-heading">
    <div className="mb-8">
      <h2 id="claim-profile-heading" className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]">Your profile details</h2>
      <p className="mt-4 max-w-[55ch] text-base leading-[1.7] text-[#777]">{preview?.xSuggestion?.name ? "We’ve filled in your X details. Keep them or edit them below." : preview?.xSuggestion ? "We’ve suggested your X username. Choose the name and username people will see." : "Choose the name and username people will see on Inspora."}</p>
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
