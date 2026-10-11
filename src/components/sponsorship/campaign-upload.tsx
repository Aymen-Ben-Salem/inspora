"use client";
import Image from "next/image";
import { useId, useState } from "react";
import type { VerifiedSponsorAsset } from "@/features/sponsorship/types";

export function CampaignUpload({ label, accept, hint, asset, disabled = false, busy = false, message, failed = false, large = false, onUpload }: {
  label: string; accept: string; hint: string; asset?: VerifiedSponsorAsset;
  disabled?: boolean; busy?: boolean; message?: string; failed?: boolean;
  large?: boolean; onUpload: (file: File) => void;
}) {
  const hintId = useId(), [dragging, setDragging] = useState(false);
  const locked = disabled || busy;
  return <label
    onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (!locked && file) onUpload(file); }}
    className={`relative flex min-w-0 flex-col rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-[#262626] focus-within:ring-offset-2 ${locked ? "cursor-default" : "cursor-pointer hover:border-[#b8b8b8]"} ${dragging ? "border-[#262626] bg-[#f0f0f0]" : "border-dashed border-[#d7d7d7] bg-[#fafafa]"}`}
  >
    <span className="text-sm font-medium text-[#262626]">{label}</span>
    <input aria-label={label} aria-describedby={hintId} type="file" disabled={locked} accept={accept} className="sr-only" onChange={(event) => {
      const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = "";
    }} />
    <span className={`flex items-center justify-center overflow-hidden py-5 ${large ? "min-h-[180px]" : "min-h-[116px]"}`}>
      {asset ? asset.contentType.startsWith("video/") ? <video src={asset.url} muted playsInline preload="metadata" className="max-h-40 max-w-full rounded object-contain" /> :
        <Image src={asset.url} alt={`${label} preview`} width={asset.width} height={asset.height} unoptimized className={`${large ? "max-h-40" : "max-h-20"} max-w-full object-contain`} /> :
        <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-8 text-[#a3a3a3]">
          <path d="M16 22V6m-6 6 6-6 6 6M6 21v5h20v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>}
    </span>
    <span id={hintId} className="text-xs leading-5 text-[#767676]">{hint}</span>
    <span className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-[#767676]">{busy ? "Uploading…" : asset ? "Drop a replacement" : "Drop a file here"}</span>
      <span aria-hidden="true" className={`rounded border border-[#e6e6e6] bg-white px-3 py-1.5 text-xs text-[#262626] ${locked ? "opacity-40" : ""}`}>{asset ? "Replace" : "Browse"}</span>
    </span>
    {message ? <span role={failed ? "alert" : "status"} aria-live="polite" className={`mt-3 text-xs leading-5 ${failed ? "text-[#b42318]" : "text-[#767676]"}`}>{message}</span> : null}
  </label>;
}
