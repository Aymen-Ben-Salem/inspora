import { CreatorManager } from "@/components/admin/creator-manager";
import { parseAdminPage } from "@/features/admin/library-pagination";
import {
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
  searchParams: Promise<{ saved?: string; deleted?: string; q?: string | string[]; page?: string | string[]; claimsPage?: string | string[] }>;
}) {
  const { saved, deleted, q, page, claimsPage } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? "";
  const [creators, claims] = await Promise.all([
    getAdminCreatorDirectory({ query, page: parseAdminPage(page) }),
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
        {saved || deleted ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {deleted ? "Creator deleted." : "Creator saved."}
          </p>
        ) : null}
      </div>
      <CreatorManager
        creators={creators.items}
        claims={claims.items}
        directoryPage={{ page: creators.page, totalPages: creators.totalPages, query }}
        claimsPage={{ page: claims.page, totalPages: claims.totalPages }}
        saveAction={saveCreatorAction}
        deleteAction={deleteCreatorAction}
        reviewAction={reviewCreatorClaimAction}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
