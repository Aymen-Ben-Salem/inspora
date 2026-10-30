import { CreatorManager } from "@/components/admin/creator-manager";
import Link from "next/link";
import { parseAdminPage } from "@/features/admin/library-pagination";
import {
  trashCreatorAction,
  restoreCreatorAction,
  deleteCreatorAction,
  reviewCreatorClaimAction,
  saveCreatorAction,
} from "@/features/admin/creator-actions";
import {
  getAdminCreatorClaimPage,
  getAdminCreatorDirectory,
} from "@/features/creators/identity";

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; trashed?: string; restored?: string; deleted?: string; cleanup?: string; view?: string; q?: string | string[]; page?: string | string[]; claimsPage?: string | string[] }>;
}) {
  const { saved, trashed, restored, deleted, cleanup, view, q, page, claimsPage } = await searchParams;
  const trash = view === "trash";
  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";
  const [creators, claims] = await Promise.all([
    getAdminCreatorDirectory({ query, page: parseAdminPage(page), trash }),
    getAdminCreatorClaimPage(parseAdminPage(claimsPage)),
  ]);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Attribution</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Creators</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#666]">
            Manage creator profiles, editorial credit, and verified identity claims.
          </p>
        </div>
        {saved || trashed || restored || deleted ? (
          <p role="status" className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {deleted ? (cleanup === "pending" ? "Profile and work removed. Account or file cleanup is still pending." : "Creator and their work permanently deleted.") : trashed ? "Creator moved to Trash." : restored ? "Creator restored." : "Creator saved."}
            {deleted && cleanup === "pending" ? <> <Link href="/admin/cleanup" className="focus-ring rounded underline underline-offset-4">Review cleanup</Link></> : null}
            {trashed ? <> <Link href="/admin/creators?view=trash" className="focus-ring rounded underline underline-offset-4">View Trash</Link></> : null}
          </p>
        ) : null}
      </div>
      <CreatorManager
        creators={creators.items}
        claims={claims.items}
        directoryPage={{ page: creators.page, totalPages: creators.totalPages, query, trash }}
        claimsPage={{ page: claims.page, totalPages: claims.totalPages }}
        saveAction={saveCreatorAction}
        trashAction={trashCreatorAction}
        restoreAction={restoreCreatorAction}
        deleteAction={deleteCreatorAction}
        reviewAction={reviewCreatorClaimAction}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
