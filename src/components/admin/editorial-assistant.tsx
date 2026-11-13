"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { EditorialKind } from "@/features/admin/editorial-contract";

const Panel = dynamic(() => import("./editorial-panel"), { loading: () => <p role="status" className="py-4 text-sm text-[#555]">Getting ready…</p> });
export function EditorialAssistant({ hasMedia, ...props }: { kind: EditorialKind; hasMedia: boolean; onCategory?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <section aria-label="AI writing assistant" className="min-w-0 rounded-xl border border-[#dcdcd5] bg-[#f7f7f4] p-4 sm:p-5">
    {open ? <Panel {...props} autoStart /> : <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-lg">
        <h3 className="text-base font-medium text-[#262626]">A hand with the details</h3>
        <p className="mt-1 text-sm leading-relaxed text-[#62625d]">AI can draft the description, categories and search notes from your media. You choose what to use.</p>
        {!hasMedia && <p className="mt-2 text-sm text-[#62625d]">Add your media above to get started.</p>}
      </div>
      <button type="button" disabled={!hasMedia} className="focus-ring min-h-11 shrink-0 rounded-lg bg-[#262626] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#41413e] active:bg-[#171717] disabled:cursor-not-allowed disabled:opacity-45" onClick={() => setOpen(true)}>Generate details</button>
    </div>}
  </section>;
}
