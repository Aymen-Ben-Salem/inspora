import { CreatorManager } from "@/components/admin/creator-manager";
import {
  deleteCreatorAction,
  reviewCreatorClaimAction,
  saveCreatorAction,
} from "@/features/admin/creator-actions";
import {
  getAdminCreatorClaims,
  getAdminCreators,
} from "@/features/creators/repository";

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const [{ saved, deleted }, creators, claims] = await Promise.all([
    searchParams,
    getAdminCreators(),
    getAdminCreatorClaims(),
  ]);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Attribution</p>
          <h1 className="mt-1 text-4xl font-medium tracking-[-0.05em]">Creators</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#666]">
            Manage editorial credit and review verified identity claims without changing mirrored records.
          </p>
        </div>
        {saved || deleted ? (
          <p className="rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-800">
            {deleted ? "Creator deleted." : "Creator saved."}
          </p>
        ) : null}
      </div>
      <CreatorManager
        creators={creators}
        claims={claims}
        saveAction={saveCreatorAction}
        deleteAction={deleteCreatorAction}
        reviewAction={reviewCreatorClaimAction}
        lockExistingCreators={process.env.DATA_ENVIRONMENT === "preview"}
      />
    </div>
  );
}
