"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { submitCreatorClaimAction } from "@/features/creators/claim-actions";
import type { ClaimActionState, CreatorClaimPreview } from "@/features/creators/types";
import { ConnectClaimX } from "./connect-claim-x";
import { ClaimProfilePreview } from "./claim-profile-preview";
import { rememberClaimSuccess } from "./claim-success-notice";
import { refreshViewerProfile } from "./use-viewer-profile";
import { claimProfileSchema } from "@/features/creators/claim-validation";
import { ClaimProfileFields, useClaimUsernameAvailability } from "./claim-profile-fields";

const buttonClass = "focus-ring flex min-h-12 w-full cursor-pointer items-center justify-center bg-[#262626] px-6 py-3 text-sm text-white transition-colors hover:bg-[#111] active:translate-y-px disabled:cursor-wait disabled:opacity-50 sm:w-fit sm:min-w-48";
const inputClass = "focus-ring w-full border border-black/15 bg-white px-3 py-3 text-base";
const linkClass = "focus-ring inline-flex min-h-11 w-fit cursor-pointer items-center py-2 text-sm text-[#767676] underline decoration-black/25 underline-offset-4 hover:text-[#262626] hover:decoration-black";
const formColumnClass = "min-w-0 max-w-[680px] lg:col-span-8 lg:col-start-5";

export function CreatorClaimForm({ targetId, targetName, returnPath, connectedXUsername, xMatches, report = false, signedIn = true, verificationError, preview }: {
  targetId: string; targetName: string; returnPath: string; connectedXUsername: string | null; xMatches: boolean; report?: boolean; signedIn?: boolean; verificationError?: string; preview?: CreatorClaimPreview;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(report);
  const [state, action, pending] = useActionState(submitCreatorClaimAction, { status: "idle" } as ClaimActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const [profile, setProfile] = useState(() => ({
    name: preview?.xSuggestion?.name ?? preview?.resultingProfile?.name ?? targetName,
    username: preview?.xSuggestion?.username ?? preview?.resultingProfile?.username ?? connectedXUsername ?? "",
  }));
  const [touched, setTouched] = useState({ name: false, username: false });
  const availability = useClaimUsernameAvailability(targetId, profile.username, xMatches && !reporting && !pending && state.status !== "success");
  const validation = claimProfileSchema.safeParse(profile);
  const errors: { name?: string; username?: string } = {};
  if (!validation.success) for (const issue of validation.error.issues) {
    const field = issue.path[0];
    if ((field === "name" || field === "username") && (touched[field] || (field === "username" && profile.username))) errors[field] ??= issue.message;
  }
  if (availability?.status === "unavailable") errors.username ??= availability.message;
  for (const field of ["name", "username"] as const) {
    if (state.fieldErrors?.[field] && state.submittedProfile?.[field] === profile[field]) errors[field] ??= state.fieldErrors[field];
  }
  useEffect(() => {
    if (state.status !== "error") return;
    const field = state.fieldErrors?.name ? "name" : state.fieldErrors?.username ? "username" : undefined;
    if (field) (formRef.current?.elements.namedItem(field) as HTMLInputElement | null)?.focus();
    else formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [state]);
  function validateSubmission(event: FormEvent<HTMLFormElement>) {
    if (reporting) return;
    setTouched({ name: true, username: true });
    const invalidField = !validation.success ? validation.error.issues[0]?.path[0] : errors.username ? "username" : undefined;
    if (invalidField === "name" || invalidField === "username") {
      event.preventDefault();
      (event.currentTarget.elements.namedItem(invalidField) as HTMLInputElement | null)?.focus();
    }
  }
  useEffect(() => {
    if (state.status !== "success" || reporting || !state.claimedCreatorId) return;
    rememberClaimSuccess(state.claimedCreatorId);
    refreshViewerProfile();
    router.replace("/profile");
    router.refresh();
  }, [state, reporting, router]);

  if (state.status === "success") return <div className="grid gap-5 border-t border-[#e6e6e6] pt-6">
    <p role="status" className="flex items-center gap-2 text-sm leading-6"><Check size={18} aria-hidden="true" />{state.message}</p>
    <Link className={buttonClass} href={reporting ? "/profile/claims" : "/profile"}>{reporting ? "View report" : "Go to my profile"}</Link>
  </div>;
  return <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-8 xl:gap-x-12">
    {preview ? <aside className="min-w-0 border-b border-black/10 pb-6 lg:col-span-3 lg:border-b-0 lg:pb-0">
      <ClaimProfilePreview preview={preview} reporting={reporting} action={!report ? <button type="button" disabled={pending} onClick={() => setReporting(!reporting)} className={`${linkClass} disabled:cursor-wait`}>{reporting ? "Back to claiming" : "This isn’t me"}</button> : null} />
      {!reporting && xMatches ? <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#777]"><Check size={15} className="mt-1 shrink-0 text-[#262626]" aria-hidden="true" /><span>X matched: <span className="inline-block max-w-full break-all">@{connectedXUsername}</span></span></p> : null}
    </aside> : null}
    {reporting && !signedIn ? <div className={`grid content-start gap-4 ${formColumnClass}`}>
      <p className="text-sm leading-6 text-[#767676]">Sign in to report an incorrect attribution. We’ll review the details you send.</p>
      <Link className={buttonClass} href={("/sign-in?redirect_url=" + encodeURIComponent(returnPath + "?report=1")) as Route}>Sign in to report</Link>
      {!report && !preview ? <button type="button" onClick={() => setReporting(false)} className={linkClass}>Back to claiming</button> : null}
    </div> : <form ref={formRef} action={action} onSubmit={validateSubmission} noValidate={!reporting} aria-busy={pending} className={`grid content-start gap-5 ${formColumnClass}`}>
      <input type="hidden" name="targetCreatorId" value={targetId} />
      <input type="hidden" name="method" value={reporting ? "ownership_report" : "x"} />
      <fieldset disabled={pending} className="grid min-w-0 gap-6">
        {reporting ? <div className="grid gap-4">
          <div className="mb-4"><h2 className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]">Report an incorrect attribution</h2><p className="mt-4 text-base leading-[1.7] text-[#777]">Tell us what’s wrong and include a public link we can check. Reporting a problem does not claim the profile.</p></div>
          <label className="grid gap-2 text-sm">Evidence link<input name="evidenceUrl" type="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={2048} placeholder="https://your-portfolio.com" className={inputClass} /></label>
          <label className="grid gap-2 text-sm">What should we correct?<textarea name="evidenceNote" required minLength={20} maxLength={2000} rows={4} className={inputClass} placeholder="Explain the attribution problem. Don’t include passwords or private documents." /></label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input name="confirmed" type="checkbox" required className="mt-1.5 cursor-pointer accent-black" />The information in this report is accurate.</label>
        </div> : xMatches ? <>
          {!preview ? <p className="flex items-center gap-2 text-sm"><Check size={16} aria-hidden="true" /><span>X account matched <span className="text-[#767676]">· @{connectedXUsername}</span></span></p> : null}
          <ClaimProfileFields profile={profile} preview={preview} errors={errors} availability={availability}
            onChange={(field, value) => { setProfile(current => ({ ...current, [field]: value })); setTouched(current => ({ ...current, [field]: true })); }}
            onBlur={field => setTouched(current => ({ ...current, [field]: true }))} />
        </> : connectedXUsername ? <div className="grid gap-2 text-sm leading-6">
          <h2 className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]">{verificationError ? "We couldn’t verify this profile" : "This profile uses a different X account"}</h2>
          <p className="text-[#767676]">{verificationError ?? `You’re connected as @${connectedXUsername}. Connect the matching X account, or report an incorrect attribution.`}</p>
          <Link href="/profile?modal=edit" className={linkClass}>Manage X connection</Link>
          {verificationError ? <button type="button" onClick={() => router.refresh()} className={linkClass}>Try verification again</button> : null}
        </div> : <div className="grid gap-5">
          <h2 className="text-[27px] font-normal leading-[1.1] tracking-[-0.035em] sm:text-[34px]">Connect your X account</h2>
          <p className="text-base leading-[1.7] text-[#777]">Connect the X account associated with {targetName}. You’ll review your profile details before claiming.</p>
          <ConnectClaimX returnPath={returnPath} />
        </div>}
        {reporting || xMatches ? <div className="grid gap-5 border-t border-black/10 pt-6">
          {!reporting ? <div>
            <p className="max-w-[58ch] text-sm leading-[1.7] text-[#777]">{preview?.merging ? `Your ${preview.combinedWorkCount} ${preview.combinedWorkCount === 1 ? "work will" : "works will"} be brought together in this profile. Your login and existing profile links will stay the same.` : "You’ll manage this profile and its work with the name and username above."}</p>
            <details className="group mt-2 text-sm">
              <summary className="focus-ring flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-[#777] hover:text-[#262626] [&::-webkit-details-marker]:hidden">What else is kept?<ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-180" /></summary>
              <p className="max-w-[58ch] pb-2 text-sm leading-[1.7] text-[#777]">Your X connection and saved items stay with your account. Photos and website links you edited yourself are kept. You can change your profile details later in Edit Profile.</p>
            </details>
          </div> : null}
          <button name={reporting ? undefined : "confirmed"} value={reporting ? undefined : "on"} type="submit" disabled={pending} className={`${buttonClass} gap-2`}>
            {pending ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{pending ? reporting ? "Sending report…" : "Claiming profile…" : reporting ? "Send report" : "Claim my profile"}
          </button>
        </div> : null}
        {!report && !preview ? <button type="button" onClick={() => setReporting(!reporting)} className={linkClass}>{reporting ? "Back to claiming" : "This isn’t me"}</button> : null}
      </fieldset>
      {state.status === "error" && !state.fieldErrors ? <p role="alert" tabIndex={-1} className="focus-ring text-sm leading-6 text-red-700">{state.message}</p> : null}
    </form>}
  </div>;
}
