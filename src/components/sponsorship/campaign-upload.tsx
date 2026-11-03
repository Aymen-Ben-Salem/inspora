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
    className={`group relative flex min-w-0 flex-col gap-2 ${locked ? "cursor-default" : "cursor-pointer"}`}
  >
    <span className={`${campaignType.label} text-[#262626]`}>{label}</span>
    <input aria-label={label} aria-describedby={hintId} aria-busy={busy || suggesting} type="file" disabled={locked} accept={accept} className="sr-only" onChange={(event) => {
      const file = event.target.files?.[0]; if (!locked && file) onUpload(file); event.target.value = "";
    }} />
    <span className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-md border border-dashed px-4 py-6 text-center transition-colors group-focus-within:ring-2 group-focus-within:ring-[#262626] group-focus-within:ring-offset-2 ${large ? "min-h-[280px]" : "min-h-[232px]"} ${!locked ? "group-hover:border-[#b8b8b8]" : ""} ${dragging && !locked ? "border-[#262626] bg-[#f0f0f0]" : "border-[#e6e6e6] bg-[#fcfcfc]"}`}>
      <span className="relative flex min-h-14 w-full items-center justify-center overflow-hidden">
        {asset ? asset.contentType.startsWith("video/") ? <video src={asset.url} muted playsInline preload="metadata" className="max-h-40 max-w-full rounded object-contain" /> :
          <Image src={asset.url} alt={`${label} preview`} width={asset.width} height={asset.height} unoptimized className={`${large ? "max-h-40" : "max-h-20"} max-w-full object-contain`} /> :
          <Image src="/sponsorship/upload-zone.svg" alt="" aria-hidden="true" width={56} height={56} className="shrink-0 opacity-[0.76]" />}
        {busy || suggesting ? <span className="absolute inset-0 grid place-items-center bg-[#fcfcfc]/90"><SponsorSpinner className="size-6 text-[#767676]" /></span> : null}
      </span>
      <span className="flex w-full min-w-0 flex-col items-center gap-2 opacity-[0.76]">
        <span className={`${campaignType.label} text-[#767676]`}>
          {suggesting ? "Finding website suggestion…" : busy ? "Uploading…" : asset ? "Drop a replacement or click to browse" : "Drop your file here or click to browse"}
        </span>
        <span id={hintId} className={`${campaignType.caption} whitespace-pre-line text-[#9e9e9e]`}>{hint}</span>
      </span>
    </span>
    {message ? <span role={failed ? "alert" : "status"} aria-live="polite" className={`${campaignType.caption} ${failed ? "text-[#b42318]" : "text-[#767676]"}`}>{message}</span> : null}
  </label>;
}
