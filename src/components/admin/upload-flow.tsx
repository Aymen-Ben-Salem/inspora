"use client";

import type { ReactNode } from "react";
import "./upload-flow.css";

export function UploadGuide() {
  return <nav aria-label="Upload sections" className="upload-guide xl:col-span-2">
    {[["01", "Media", "upload-media"], ["02", "Details", "upload-details"], ["03", "Creator", "upload-creator"]].map(([step, title, id]) =>
      <a key={id} href={`#${id}`} className="focus-ring flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white"><span className="text-xs tabular-nums text-[#767676]">{step}</span>{title}</a>)}
    <span className="hidden text-sm text-[#666] sm:ml-auto sm:block">Drafts stay private until published.</span>
  </nav>;
}

export function UploadSectionTitle({ step, title, children }: { step: string; title: string; children?: ReactNode }) {
  return <div className="flex items-start gap-3">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-black/15 text-xs tabular-nums text-[#666]">{step}</span>
    <div><h2 className="text-xl font-medium tracking-[-0.03em]">{title}</h2>{children && <p className="mt-1 text-sm leading-relaxed text-[#666]">{children}</p>}</div>
  </div>;
}

export function FileDetails({ children, enabled, title = "File settings" }: { children: ReactNode; enabled: boolean; title?: string }) {
  if (!enabled) return children;
  return <details className="col-span-full border-t border-black/10" onInvalidCapture={event => { event.currentTarget.open = true; }}>
    <summary className="focus-ring min-h-11 cursor-pointer py-3 text-sm text-[#666] hover:text-black">{title}</summary>
    <div className="grid gap-4 pb-2 sm:grid-cols-2">{children}</div>
  </details>;
}
