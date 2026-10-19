"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { AdminLibraryPagination } from "./library-pagination";
import { CreatorWorkDrawer } from "./creator-work-drawer";
import { CreatorEditDrawer } from "./creator-edit-drawer";

import {
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

function deletionRestriction(creator: AdminCreatorRecord, lockExistingCreators: boolean) {
  if (lockExistingCreators && creator.recordOrigin !== "preview") return "Only Preview-created records can be deleted in Preview.";
  if (creator.ownerUserId || creator.xProviderId) return "Claimed or provider-associated creators cannot be deleted.";
  if (creator.workCount > 0) return "Creators with credited work cannot be deleted.";
  if (creator.pendingClaimCount > 0) return "Creators with pending claims cannot be deleted.";
  return undefined;
}

export function CreatorManager({
  creators,
  claims,
  saveAction,
  deleteAction,
  reviewAction,
  lockExistingCreators,
  directoryPage,
  claimsPage,
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
  directoryPage?: { page: number; totalPages: number; query: string };
  claimsPage?: { page: number; totalPages: number };
}) {
  const [deleteState, deleteFormAction, isDeleting] = useActionState(
    deleteAction,
    initialAdminActionState,
  );
  const [creator, setCreator] = useState<AdminCreatorInput>(blankAdminCreator());
  const [search, setSearch] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [workCreator, setWorkCreator] = useState<AdminCreatorRecord | null>(null);
  const dismissEditor = useCallback(() => setIsEditorOpen(false), []);
  const dismissWork = useCallback(() => setWorkCreator(null), []);
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

  return (
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="grid min-w-0 content-start gap-6">
        {deleteState.status === "error" ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteState.message}
          </p>
        ) : null}

        <section className="grid min-w-0 gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Directory</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Creator records</h2>
            </div>
            {directoryPage ? (
              <form action="/admin/creators" className="flex w-full gap-2 sm:w-80">
                <input name="q" defaultValue={directoryPage.query} aria-label="Search creators" placeholder="Name, username, Website or X" className={inputClass} />
                <button className="focus-ring rounded-full bg-black px-4 text-sm text-white">Search</button>
              </form>
            ) : <label className="grid w-full min-w-0 gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#777] sm:w-64">
              Search
              <input
                className={inputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, username, Website or X"
              />
            </label>}
          </div>
          {directoryPage ? <AdminLibraryPagination path="/admin/creators" page={directoryPage.page} totalPages={directoryPage.totalPages} query={{ q: directoryPage.query, claimsPage: String(claimsPage?.page ?? 1) }} /> : null}
          <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {filteredCreators.map((item) => {
              const deleteRestriction = deletionRestriction(item, lockExistingCreators);
              return (
              <div
                key={item.id}
                className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors ${
                  creator.id === item.id
                    ? "border-black bg-[#f3f3ef]"
                    : "border-black/10 hover:bg-[#f7f7f4]"
                }`}
              >
                <button type="button" onClick={() => { setCreator(toAdminCreatorDraft(item)); setWorkCreator(null); setIsEditorOpen(true); }} aria-pressed={creator.id === item.id} aria-haspopup="dialog"
                  className="focus-ring grid min-w-0 flex-1 basis-full items-start gap-2 rounded-sm text-left sm:basis-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                <span className="min-w-0 break-words">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="mt-1 block text-xs text-[#777]">
                    {item.username ? `@${item.username}` : "Username not assigned"}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.08em] text-[#666] sm:justify-end">
                  <span>{item.workCount} works</span>
                  {item.ownerUserId ? <span>Claimed</span> : null}
                  {item.pendingClaimCount ? <span>{item.pendingClaimCount} pending</span> : null}
                </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" aria-label={`View work by ${item.name}`} aria-haspopup="dialog"
                    onClick={() => { setIsEditorOpen(false); setWorkCreator(item); }} className="focus-ring shrink-0 rounded-full border border-black/10 bg-white px-3 py-2 text-xs hover:bg-[#efefec]">View work</button>
                  <button type="button" aria-label={`Edit ${item.name}`} aria-haspopup="dialog"
                    onClick={() => { setCreator(toAdminCreatorDraft(item)); setWorkCreator(null); setIsEditorOpen(true); }} className="focus-ring shrink-0 rounded-full bg-black px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#252525]">Edit</button>
                  <form action={deleteFormAction} className="flex">
                    <input type="hidden" name="creatorId" value={item.id} />
                    <button type="submit" aria-label={`Delete ${item.name}`} title={deleteRestriction ?? "Delete unused creator"}
                      disabled={Boolean(deleteRestriction) || isDeleting}
                      className="focus-ring shrink-0 rounded-full border border-red-200 bg-white px-3 py-2 text-xs text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
                  </form>
                </div>
              </div>
              );
            })}
            {filteredCreators.length === 0 ? (
              <p className="rounded-xl bg-[#f7f7f4] p-5 text-sm text-[#777]">
                No creator matches this search.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => { setCreator(blankAdminCreator()); setWorkCreator(null); setIsEditorOpen(true); }}
            className="focus-ring justify-self-start rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-[#f3f3f3]"
          >
            Create a new creator
          </button>
        </section>
      </div>

      <aside className="grid min-w-0 content-start gap-4">
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
              <div className="min-w-0 break-words">
                <h3 className="font-medium">{claim.targetCreatorName}</h3>
                <a
                  href={`https://x.com/${claim.verifiedXUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring mt-1 inline-block max-w-full break-all rounded text-sm text-[#666] underline underline-offset-4"
                >
                  @{claim.verifiedXUsername}
                </a>
              </div>
              <span className="shrink-0 rounded-full bg-[#f1f1ed] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#666]">
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
        {claimsPage ? <AdminLibraryPagination path="/admin/creators" page={claimsPage.page} totalPages={claimsPage.totalPages} pageParam="claimsPage" query={{ q: directoryPage?.query, page: String(directoryPage?.page ?? 1) }} /> : null}
      </aside>
      {workCreator ? <CreatorWorkDrawer creator={workCreator} onDismiss={dismissWork} /> : null}
      {isEditorOpen ? <CreatorEditDrawer creator={selected} saveAction={saveAction} onDismiss={dismissEditor} /> : null}
    </div>
  );
}
