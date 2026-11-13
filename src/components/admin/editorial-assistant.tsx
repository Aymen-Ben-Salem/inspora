"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { EditorialKind } from "@/features/admin/editorial-contract";

const Panel = dynamic(() => import("./editorial-panel"), { loading: () => <p role="status">Loading editorial assistant…</p> });
export function EditorialAssistant(props: { kind: EditorialKind; onCategory?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <section className="grid gap-3 rounded-2xl border border-black/10 bg-[#f7f7f4] p-5">
    <div><h2 className="text-lg font-medium">Editorial suggestions</h2>
      <p className="mt-1 text-sm text-[#666]">Prepare a description, classifications and hidden search notes from the uploaded work. Review everything before saving.</p></div>
    {open ? <Panel {...props} /> : <button type="button" className="focus-ring justify-self-start rounded-full bg-black px-4 py-2 text-sm text-white" onClick={() => setOpen(true)}>Open editorial assistant</button>}
  </section>;
}
