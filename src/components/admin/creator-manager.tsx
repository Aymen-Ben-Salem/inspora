"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Trash2 } from "lucide-react";
import { AdminLibraryPagination } from "./library-pagination";
import { CreatorWorkDrawer } from "./creator-work-drawer";
import { CreatorEditDrawer } from "./creator-edit-drawer";
import { CreatorDirectorySearch } from "./creator-directory-search";
import { CreatorTrashDialog } from "./creator-trash-dialog";

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

export function CreatorManager({
  creators,
  claims,
  saveAction,
  trashAction,
  restoreAction,
  directoryPage,
  claimsPage,
}: {
  creators: AdminCreatorRecord[];
  claims: AdminCreatorClaimRecord[];
  saveAction: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  trashAction: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  restoreAction: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  reviewAction?: (formData: FormData) => Promise<unknown>;
  lockExistingCreators: boolean;
  directoryPage?: { page: number; totalPages: number; query: string; trash?: boolean };
  claimsPage?: { page: number; totalPages: number };
}) {
  const [restoreState, restoreFormAction, isRestoring] = useActionState(
    restoreAction,
    initialAdminActionState,
  );
  const [creator, setCreator] = useState<AdminCreatorInput>(blankAdminCreator());
  const [search, setSearch] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [workCreator, setWorkCreator] = useState<AdminCreatorRecord | null>(null);
  const [trashCreator, setTrashCreator] = useState<AdminCreatorRecord | null>(null);
  const dismissTrash = useCallback(() => setTrashCreator(null), []);
  const dismissEditor = useCallback(() => setIsEditorOpen(false), []);
  const dismissWork = useCallback(() => setWorkCreator(null), []);
  function openEditor(item?: AdminCreatorRecord) {
    setCreator(item ? toAdminCreatorDraft(item) : blankAdminCreator());
    setWorkCreator(null);
    // Each opening owns a fresh draft, including an immediate Cancel/reopen.
    setEditorSession((session) => session + 1);
    setIsEditorOpen(true);
  }
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
        {restoreState.status === "error" ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {restoreState.message}
          </p>
        ) : null}

        <section className="grid min-w-0 gap-4 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#888]">Directory</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">Creator records</h2>
            </div>
            {directoryPage ? (
              <CreatorDirectorySearch query={directoryPage.query} />
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
          <nav aria-label="Creator status" className="flex gap-2">
            <Link href="/admin/creators" aria-current={!directoryPage?.trash ? "page" : undefined} className={`focus-ring rounded-full px-4 py-2 text-sm ${!directoryPage?.trash ? "bg-[#262626] text-white" : "bg-[#f3f3f1] text-[#555]"}`}>Active</Link>
            <Link href="/admin/creators?view=trash" aria-current={directoryPage?.trash ? "page" : undefined} className={`focus-ring inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm ${directoryPage?.trash ? "bg-[#262626] text-white" : "bg-[#f3f3f1] text-[#555]"}`}><Trash2 aria-hidden="true" className="size-4" />Trash</Link>
          </nav>
          {directoryPage?.trash ? <p className="text-sm leading-6 text-[#666]">Profiles and their work are hidden from the public site. Restore a creator to bring them back. Nothing here is permanently deleted.</p> : null}
          {directoryPage ? <AdminLibraryPagination path="/admin/creators" page={directoryPage.page} totalPages={directoryPage.totalPages} query={{ q: directoryPage.query, view: directoryPage.trash ? "trash" : undefined, claimsPage: String(claimsPage?.page ?? 1) }} /> : null}
          <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {filteredCreators.map((item) => {
              return (
              <div
                key={item.id}
                className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors ${
                  creator.id === item.id
                    ? "border-black bg-[#f3f3ef]"
                    : "border-black/10 hover:bg-[#f7f7f4]"
                }`}
              >
                <button type="button" onClick={() => openEditor(item)} aria-pressed={creator.id === item.id} aria-haspopup="dialog"
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
                    onClick={() => openEditor(item)} className="focus-ring shrink-0 rounded-full bg-black px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#252525]">Edit</button>
                  {item.trashedAt ? <form action={restoreFormAction} className="flex">
                    <input type="hidden" name="creatorId" value={item.id} />
                    <input type="hidden" name="operation" value="restore" />
                    <button type="submit" aria-label={`Restore ${item.name}`}
                      disabled={isRestoring}
                      className="focus-ring shrink-0 cursor-pointer rounded-full border border-black/10 bg-[#262626] px-3 py-2 text-xs text-white hover:bg-[#3f3f3f] disabled:cursor-wait disabled:opacity-40">Restore</button>
                  </form> : <button type="button" aria-label={`Move to Trash: ${item.name}`} title="Move to Trash" aria-haspopup="dialog"
                    onClick={() => setTrashCreator(item)} disabled={isRestoring}
                    className="focus-ring flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-40"><Trash2 aria-hidden="true" className="size-4" /></button>}
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
            onClick={() => openEditor()}
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
            Review X verification, manual evidence, and ownership reports. Pending requests appear first.
          </p>
        </div>
        {claims.map((claim) => (
          <article key={claim.id} className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 break-words">
                <h3 className="font-medium">{claim.targetCreatorName}</h3>
                {claim.verifiedXUsername ? <a
                  href={`https://x.com/${claim.verifiedXUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring mt-1 inline-block max-w-full break-all rounded text-sm text-[#666] underline underline-offset-4"
                >
                  @{claim.verifiedXUsername}
                </a> : <p className="mt-1 text-sm text-[#666]">{claim.method === "ownership_report" ? "Ownership report" : "Manual evidence"}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#f1f1ed] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#666]">
                {claim.status}
              </span>
            </div>
            <p className="mt-3 break-all text-xs text-[#888]">Requester {claim.requesterUserId}</p>
            {claim.status === "pending" ? (
              <Link href={("/admin/creators/claims/" + claim.id) as Route} className="focus-ring mt-4 inline-block cursor-pointer rounded-full bg-[#262626] px-5 py-3 text-sm text-white">Review request</Link>
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
        {claimsPage ? <AdminLibraryPagination path="/admin/creators" page={claimsPage.page} totalPages={claimsPage.totalPages} pageParam="claimsPage" query={{ q: directoryPage?.query, page: String(directoryPage?.page ?? 1), view: directoryPage?.trash ? "trash" : undefined }} /> : null}
      </aside>
      {workCreator ? <CreatorWorkDrawer creator={workCreator} onDismiss={dismissWork} /> : null}
      {isEditorOpen ? <CreatorEditDrawer key={editorSession} creator={selected} saveAction={saveAction} onDismiss={dismissEditor} /> : null}
      {trashCreator ? <CreatorTrashDialog key={trashCreator.id} creator={trashCreator} action={trashAction} onDismiss={dismissTrash} /> : null}
    </div>
  );
}
