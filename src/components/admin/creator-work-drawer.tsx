"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { AdminCreatorRecord } from "@/features/creators/types";
import type { AdminCreatorWork, AdminCreatorWorkPage } from "@/features/admin/creator-work-types";

type Creator = Pick<AdminCreatorRecord, "id" | "name" | "username" | "workCount">;
type Props = { creator: Creator; onDismiss: () => void };
const kindLabels = { design: "Design", logo: "Logo", "app-icon": "App icon", website: "Website" };
const statusStyles = {
  published: "bg-[#dcebdd] text-[#315f37]",
  draft: "bg-[#f3e9ce] text-[#795d18]",
  archived: "bg-[#e7e7e4] text-[#696965]",
};

function WorkCard({ work }: { work: AdminCreatorWork }) {
  const folder = work.kind === "design" ? "posts" : work.kind === "website" ? "websites" : "logos";
  return (
    <Link href={`/admin/${folder}/${work.id}/edit` as Route} prefetch={false}
      aria-label={`Edit ${work.title}`} className="focus-ring group overflow-hidden rounded-xl border border-black/10 bg-white">
      <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#efefec] ${work.kind === "logo" || work.kind === "app-icon" ? "p-7" : ""}`}>
        {work.thumbnailUrl ? (
          // These are existing optimized assets or video posters; opening a card loads its editor.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.thumbnailUrl} alt={work.thumbnailAlt} loading="lazy" decoding="async"
            className={`size-full ${work.kind === "logo" || work.kind === "app-icon" ? "object-contain" : "object-cover"}`} />
        ) : <span className="text-xs text-[#777]">No preview</span>}
      </div>
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[#777]">{kindLabels[work.kind]}</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${statusStyles[work.status]}`}>{work.status}</span>
        </div>
        <h3 className="truncate text-base font-medium tracking-[-0.025em] group-hover:underline">{work.title}</h3>
      </div>
    </Link>
  );
}

export function CreatorWorkDrawer(props: Props) {
  return <CreatorWorkSurface key={props.creator.id} {...props} />;
}

function CreatorWorkSurface({ creator, onDismiss }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [request, setRequest] = useState<{ query: string; cursors: Array<string | null> }>({ query: "", cursors: [null] });
  const [retry, setRetry] = useState(0);
  const cursor = request.cursors[request.cursors.length - 1];
  const requestKey = JSON.stringify([creator.id, request.query, cursor, retry]);
  const [result, setResult] = useState<{ key: string; data?: AdminCreatorWorkPage; error?: string }>();
  const current = result?.key === requestKey ? result : undefined;
  const loading = !current;
  const typing = search.trim() !== request.query;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (search.trim() === request.query) return;
    const timer = setTimeout(() => setRequest({ query: search.trim(), cursors: [null] }), 300);
    return () => clearTimeout(timer);
  }, [search, request.query]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const params = new URLSearchParams();
    if (request.query) params.set("q", request.query);
    if (cursor) params.set("cursor", cursor);
    void (async () => {
      try {
        const response = await fetch(`/admin/creators/${creator.id}/works${params.size ? `?${params}` : ""}`, {
          cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 401
          ? "Your admin session expired. Reload the page to sign in."
          : "Work could not be loaded. Try again.");
        const data: AdminCreatorWorkPage = await response.json();
        if (!Array.isArray(data.items) || (data.nextCursor !== null && typeof data.nextCursor !== "string")) throw new Error("Work could not be loaded. Try again.");
        if (active && !controller.signal.aborted) setResult({ key: requestKey, data });
      } catch (error) {
        if (active) setResult({ key: requestKey, error: controller.signal.aborted
          ? "Loading work timed out. Try again."
          : error instanceof Error && error.message === "Your admin session expired. Reload the page to sign in."
            ? error.message : "Work could not be loaded. Try again." });
      } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [creator.id, request.query, cursor, requestKey]);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-none w-full max-w-[1000px] overflow-hidden border-0 border-l border-black/10 bg-[#f5f5f2] p-0 text-[#171717] shadow-[-20px_0_60px_rgba(0,0,0,0.12)] backdrop:bg-black/30 open:flex open:flex-col">
      <header className="shrink-0 border-b border-black/10 bg-white px-5 py-6 sm:px-8">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-[#777]">Creator work</p>
            <h2 id={titleId} className="mt-2 break-words text-3xl font-medium tracking-[-0.045em]">{creator.name}</h2>
            <p className="mt-2 text-sm text-[#777]">{creator.workCount} attributed {creator.workCount === 1 ? "work" : "works"} · All statuses</p>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Close creator work" className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white hover:bg-[#f3f3f1]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <label className="mt-6 block">
          <span className="sr-only">Search creator work</span>
          <input ref={searchRef} type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or slug" className="focus-ring h-12 w-full rounded-xl border border-black/10 bg-[#f5f5f2] px-4 text-sm outline-none placeholder:text-[#888]" />
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8" aria-busy={loading || typing}>
        {loading ? <div role="status" aria-label="Loading creator work"><span className="sr-only">Loading work</span><div aria-hidden="true" className="grid grid-cols-2 gap-4 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[4/3] rounded-xl bg-black/5" />)}</div></div>
          : current.error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="text-sm">{current.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="focus-ring mt-4 rounded-full bg-black px-4 py-2 text-sm text-white">Try again</button></div>
          : current.data?.items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{current.data.items.map((work) => <WorkCard key={`${work.kind}:${work.id}`} work={work} />)}</div>
          : <div role="status" className="rounded-xl border border-dashed border-black/15 bg-white px-5 py-16 text-center"><p className="text-lg font-medium">{request.query ? "No matching work." : "No attributed work yet."}</p><p className="mt-2 text-sm text-[#777]">{request.query ? "Try a different title or slug." : "Work credited to this creator will appear here."}</p></div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-black/10 bg-white px-5 py-4 sm:px-8">
        <button type="button" disabled={request.cursors.length === 1 || loading || typing}
          onClick={() => setRequest((value) => ({ ...value, cursors: value.cursors.slice(0, -1) }))}
          className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm disabled:opacity-35">Previous</button>
        <span className="text-xs text-[#777]" aria-live="polite">Page {request.cursors.length}</span>
        <button type="button" disabled={!current?.data?.nextCursor || loading || typing}
          onClick={() => { const next = current?.data?.nextCursor; if (next) setRequest((value) => ({ ...value, cursors: [...value.cursors, next] })); }}
          className="focus-ring rounded-full border border-black/10 px-4 py-2 text-sm disabled:opacity-35">Next</button>
      </footer>
    </dialog>
  );
}
