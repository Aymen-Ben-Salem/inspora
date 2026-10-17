"use client";
import { campaignType } from "./campaign-typography";
import Image from "next/image";
import { useId, useState } from "react";
import type { VerifiedSponsorAsset } from "@/features/sponsorship/types";
import { SponsorSpinner } from "./sponsor-loading";

export function CampaignUpload({ label, accept, hint, asset, disabled = false, busy = false, suggesting = false, message, failed = false, large = false, onUpload }: {
  label: string; accept: string; hint: string; asset?: VerifiedSponsorAsset;
  disabled?: boolean; busy?: boolean; suggesting?: boolean; message?: string; failed?: boolean;
  large?: boolean; onUpload: (file: File) => void;
}) {
  const hintId = useId(), [dragging, setDragging] = useState(false);
  const locked = disabled || busy || suggesting;
  return <label
    onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (!locked && file) onUpload(file); }}
    className={`relative flex min-w-0 flex-col rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-[#262626] focus-within:ring-offset-2 ${locked ? "cursor-default" : "cursor-pointer hover:border-[#b8b8b8]"} ${dragging ? "border-[#262626] bg-[#f0f0f0]" : "border-dashed border-[#d7d7d7] bg-[#fafafa]"}`}
  >
    <span className={`${campaignType.label} text-[#262626]`}>{label}</span>
    <input aria-label={label} aria-describedby={hintId} aria-busy={busy || suggesting} type="file" disabled={locked} accept={accept} className="sr-only" onChange={(event) => {
      const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = "";
    }} />
    <span className={`relative flex items-center justify-center overflow-hidden py-5 ${large ? "min-h-[180px]" : "min-h-[116px]"}`}>
      {asset ? asset.contentType.startsWith("video/") ? <video src={asset.url} muted playsInline preload="metadata" className="max-h-40 max-w-full rounded object-contain" /> :
        <Image src={asset.url} alt={`${label} preview`} width={asset.width} height={asset.height} unoptimized className={`${large ? "max-h-40" : "max-h-20"} max-w-full object-contain`} /> :
        <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-8 text-[#a3a3a3]">
          <path d="M16 22V6m-6 6 6-6 6 6M6 21v5h20v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>}
      {suggesting ? <span className="absolute inset-0 grid place-items-center bg-[#fafafa]/90"><SponsorSpinner className="size-6 text-[#767676]" /></span> : null}
    </span>
    <span id={hintId} className={`${campaignType.caption} text-[#767676]`}>{hint}</span>
    <span className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className={`${campaignType.caption} text-[#767676]`}>{suggesting ? "Finding website suggestion…" : busy ? "Uploading…" : asset ? "Drop a replacement" : "Drop a file here"}</span>
      <span aria-hidden="true" className={`rounded border border-[#e6e6e6] bg-white px-3 py-1.5 ${campaignType.body} text-[#262626] ${locked ? "opacity-40" : ""}`}>{asset ? "Replace" : "Browse"}</span>
    </span>
    {message ? <span role={failed ? "alert" : "status"} aria-live="polite" className={`${campaignType.caption} mt-3 ${failed ? "text-[#b42318]" : "text-[#767676]"}`}>{message}</span> : null}
  </label>;
}
