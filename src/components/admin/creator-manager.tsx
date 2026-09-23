"use client";

import { useActionState, useMemo, useState } from "react";

import {
  AdminCreatorEditor,
  blankAdminCreator,
  toAdminCreatorDraft,
} from "@/components/admin/admin-creator-editor";
import type {
  AdminCreatorClaimRecord,
  AdminCreatorInput,
  AdminCreatorRecord,
} from "@/features/creators/types";
import {
  initialAdminActionState,
  type AdminActionState,
} from "@/features/admin/types";

const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30";

export function CreatorManager({
  creators,
  claims,
  saveAction,
  deleteAction,
  reviewAction,
  lockExistingCreators,
}: {
  creators: AdminCreatorRecord[];
  claims: AdminCreatorClaimRecord[];
  saveAction: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  deleteAction: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  reviewAction: (formData: FormData) => Promise<void>;
  lockExistingCreators: boolean;
}) {
  const [saveState, saveFormAction, isSaving] = useActionState(
    saveAction,
    initialAdminActionState,
  );
  const [deleteState, deleteFormAction, isDeleting] = useActionState(
    deleteAction,
    initialAdminActionState,
  );
  const [creator, setCreator] = useState<AdminCreatorInput>(blankAdminCreator());
  const [search, setSearch] = useState("");
  const filteredCreators = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return creators;
    return creators.filter((item) =>
      [
        item.name,
        item.legacyHandle,
        item.username,
        item.url,
        item.xProfileUrl,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [creators, search]);
  const selected = creators.find((item) => item.id === creator.id);
  const locked = Boolean(
    lockExistingCreators && selected && selected.recordOrigin !== "preview",
  );
  const canDelete = Boolean(
    selected &&
      !locked &&
      !selected.ownerUserId &&
      !selected.xProviderId &&
      selected.workCount === 0 &&
      selected.pendingClaimCount === 0,
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="grid gap-6">
        {(saveState.status === "error" || deleteState.status === "error") ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveState.message ?? deleteState.message}
          </p>
        ) : null}

        <section className="grid gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Directory</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Creator records</h2>
            </div>
            <label className="grid min-w-64 gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#777]">
              Search
              <input
                className={inputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, username, Website or X"
              />
            </label>
          </div>
          <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {filteredCreators.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCreator(toAdminCreatorDraft(item))}
                className={`focus-ring grid gap-2 rounded-xl border p-4 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] ${
                  creator.id === item.id
                    ? "border-black bg-[#f3f3ef]"
                    : "border-black/10 hover:bg-[#f7f7f4]"
                }`}
              >
                <span>
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="mt-1 block text-xs text-[#777]">
                    {item.username ? `@${item.username}` : "Username not assigned"}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-2 text-[10px] uppercase tracking-[0.08em] text-[#666]">
                  <span>{item.workCount} works</span>
                  {item.ownerUserId ? <span>Claimed</span> : null}
                  {item.pendingClaimCount ? <span>{item.pendingClaimCount} pending</span> : null}
                </span>
              </button>
            ))}
            {filteredCreators.length === 0 ? (
              <p className="rounded-xl bg-[#f7f7f4] p-5 text-sm text-[#777]">
                No creator matches this search.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCreator(blankAdminCreator())}
            className="focus-ring justify-self-start rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-[#f3f3f3]"
          >
            Create a new creator
          </button>
        </section>

        <form action={saveFormAction} className="grid gap-4">
          <AdminCreatorEditor
            creator={creator}
            creators={creators}
            onChange={setCreator}
            lockExistingCreators={lockExistingCreators}
          />
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white p-5">
            <button
              type="submit"
              disabled={isSaving || locked}
              className="focus-ring h-11 rounded-full bg-black px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : creator.id ? "Save creator" : "Create creator"}
            </button>
            {selected ? (
              <span className="text-xs text-[#777]">
                {selected.recordOrigin} record · {selected.workCount} credited works
              </span>
            ) : null}
          </div>
        </form>

        {selected ? (
          <form action={deleteFormAction} className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <input type="hidden" name="creatorId" value={selected.id} />
            <h2 className="font-medium text-red-950">Delete unused creator</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
              Deletion is available only for an unclaimed Preview record with no credited work or claim history.
            </p>
            <button
              type="submit"
              disabled={!canDelete || isDeleting}
              className="focus-ring mt-4 h-10 rounded-full border border-red-300 bg-white px-4 text-sm font-medium text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDeleting ? "Deleting..." : "Delete creator"}
            </button>
          </form>
        ) : null}
      </div>

      <aside className="grid content-start gap-4 xl:sticky xl:top-24">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Identity review</p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Creator claims</h2>
          <p className="mt-2 text-sm leading-6 text-[#777]">
            A verified X connection supplies evidence. Approval is the step that attaches existing credit.
          </p>
        </div>
        {claims.map((claim) => (
          <article key={claim.id} className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium">{claim.targetCreatorName}</h3>
                <a
                  href={`https://x.com/${claim.verifiedXUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring mt-1 inline-block rounded text-sm text-[#666] underline underline-offset-4"
                >
                  @{claim.verifiedXUsername}
                </a>
              </div>
              <span className="rounded-full bg-[#f1f1ed] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#666]">
                {claim.status}
              </span>
            </div>
            <p className="mt-3 break-all text-xs text-[#888]">Requester {claim.requesterUserId}</p>
            {claim.status === "pending" ? (
              <div className="mt-4 grid gap-3">
                <form action={reviewAction}>
                  <input type="hidden" name="claimId" value={claim.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className="focus-ring h-10 w-full rounded-full bg-black px-4 text-sm font-medium text-white">
                    Approve and attach work
                  </button>
                </form>
                <form action={reviewAction} className="grid gap-2">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input className={inputClass} name="reason" required placeholder="Reason for rejection" />
                  <button className="focus-ring h-10 rounded-full border border-black/10 px-4 text-sm font-medium hover:bg-[#f3f3f3]">
                    Reject claim
                  </button>
                </form>
              </div>
            ) : claim.reviewReason ? (
              <p className="mt-3 text-sm leading-6 text-[#666]">{claim.reviewReason}</p>
            ) : null}
          </article>
        ))}
        {claims.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/15 bg-white p-5 text-sm leading-6 text-[#777]">
            No creator claims have been submitted.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
