"use client";

import { useActionState } from "react";
import { cleanAdminExpiredItems, retryAdminCleanup } from "../../features/submissions/cleanup-admin-actions";

export function CleanupControl({ jobId, disabled = false }: { jobId?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(jobId ? retryAdminCleanup : cleanAdminExpiredItems, { message: "", ok: true });
  return <form action={action} className="grid justify-items-start gap-2">
    {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
    <button disabled={pending || disabled} className="focus-ring rounded-full border border-black/15 bg-white px-4 py-2 text-sm disabled:opacity-50">
      {pending ? "Working…" : jobId ? "Retry cleanup" : "Clean expired items"}
    </button>
    {state.message ? <p role={state.ok ? "status" : "alert"} className="max-w-xl text-sm text-[#666]">{state.message}</p> : null}
  </form>;
}
