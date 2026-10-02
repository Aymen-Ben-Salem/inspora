import type { Route } from "next";
import Link from "next/link";
import { getCleanupSummary } from "../../features/submissions/cleanup-admin";

export async function CleanupNotice() {
  let summary;
  try { summary = await getCleanupSummary(); } catch {
    return <Link href={"/admin/cleanup" as Route} className="mb-6 block text-sm underline">Cleanup status unavailable — open Cleanup to check.</Link>;
  }
  const due = summary.rejected + summary.uploads + summary.temporary;
  return <Link href={"/admin/cleanup" as Route} className={`mb-6 block rounded-xl border px-4 py-3 text-sm ${summary.pending || due ? "border-amber-300 bg-amber-50" : "border-black/10 bg-white"}`}>
    {summary.pending ? `Cleanup needs attention: ${summary.pending} unfinished items.` : "Cleanup: no unfinished deletions."}
    {due ? ` ${due} expired items are ready to remove.` : ""} Open Cleanup
  </Link>;
}
