import { Suspense } from "react";
import { CleanupControl } from "../../../components/admin/cleanup-controls";
import { getCleanupItems, getCleanupSummary } from "../../../features/submissions/cleanup-admin";

const labels: Record<string, string> = { delete_account: "Account deletion", delete_private_upload: "Private upload deletion", delete_public_orphan: "Unused publication files" };

async function CleanupContent() {
  const [summary, items] = await Promise.all([getCleanupSummary(), getCleanupItems()]);
  return <div className="grid gap-7">
    <header><h1 className="text-3xl font-medium">Cleanup</h1><p className="mt-3 max-w-3xl text-sm text-[#666]">Deletions are attempted immediately. If an attempt fails or is interrupted, it stays here until an admin retries it. Refresh this page for current status. There is no scheduled retry service.</p></header>
    <section className="grid gap-4 rounded-2xl border border-black/10 bg-white p-6">
      <h2 className="text-xl font-medium">Expired items</h2>
      <p className="text-sm">{summary.rejected} rejected submissions · {summary.uploads} abandoned uploads · {summary.temporary} temporary records</p>
      <p className="max-w-3xl text-sm text-[#666]">Rejected submissions become inaccessible after 48 hours. Their files remain stored until you clean them here. Each click processes up to 25 rejected submissions and 25 abandoned uploads, plus expired temporary records. This does not run pending account deletions.</p>
      <CleanupControl />
    </section>
    <section className="grid gap-4" aria-label="Unfinished cleanup">
      <h2 className="text-xl font-medium">Unfinished cleanup ({summary.pending})</h2>
      {items.length === 0 ? <p className="text-sm text-[#666]">No unfinished cleanup.</p> : null}
      {items.map((item) => {
        const running = item.status === "leased" && !!item.leaseExpiresAt && item.leaseExpiresAt > new Date();
        return <article key={item.id} className="grid gap-3 rounded-2xl border border-black/10 bg-white p-6">
          <h3 className="font-medium">{labels[item.kind] ?? "Cleanup"}</h3>
          <p className="break-all text-xs text-[#777]">Reference: {item.id}</p>
          <p className="text-sm">{running ? "An attempt is running. Refresh after it finishes." : item.status === "leased" ? "The previous attempt was interrupted. Retry to finish it." : item.attempts ? "The previous attempt could not finish. Retry when the provider is available." : "Awaiting cleanup."}</p>
          <p className="text-xs text-[#777]">Requested {item.createdAt.toISOString()} · Last update {item.updatedAt.toISOString()} · Failed attempts {item.attempts}</p>
          <CleanupControl jobId={item.id} disabled={running} />
        </article>;
      })}
      {summary.pending > items.length ? <p className="text-sm">Showing the oldest {items.length} items. More will appear as these are completed.</p> : null}
    </section>
  </div>;
}

export default function CleanupPage() {
  return <Suspense fallback={<p>Loading cleanup…</p>}><CleanupContent /></Suspense>;
}
