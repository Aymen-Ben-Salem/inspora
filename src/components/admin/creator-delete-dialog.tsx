"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import type { deleteCreatorAction } from "@/features/admin/creator-actions";
import { initialAdminActionState, type AdminActionState } from "@/features/admin/types";
import type { AdminCreatorRecord } from "@/features/creators/types";

export function CreatorDeleteDialog({ creator, action, onDismiss }: { creator: AdminCreatorRecord; action: typeof deleteCreatorAction; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId(), description = useId(), field = useId();
  const [confirmation, setConfirmation] = useState("");
  const [reverifying, setReverifying] = useState(false);
  const verificationPortalOpen = useRef(false);
  const expected = creator.username ?? creator.name;
  const verifiedAction = useReverification(async (previous: AdminActionState, form: FormData) => {
    const result = await action(previous, form);
    if ("clerk_error" in result && ref.current) {
      // Let Clerk's verification portal receive focus instead of being made
      // inert by the native dialog's top layer. Keep our own form disabled.
      ref.current.close(); ref.current.show(); verificationPortalOpen.current = true; setReverifying(true);
    }
    return result;
  });
  const [state, formAction, pending] = useActionState(async (previous: AdminActionState, form: FormData): Promise<AdminActionState> => {
    try { return await verifiedAction(previous, form); }
    catch (error) {
      if (isReverificationCancelledError(error)) return { status: "error", message: "Identity confirmation was canceled. Nothing was deleted." };
      throw error;
    } finally {
      if (ref.current && verificationPortalOpen.current) { ref.current.close(); ref.current.showModal(); }
      verificationPortalOpen.current = false;
      setReverifying(false);
    }
  }, initialAdminActionState);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    dialog.querySelector<HTMLInputElement>("input")?.focus();
    return () => { if (dialog.open) dialog.close(); document.documentElement.style.overflow = overflow; previousFocus?.focus(); };
  }, []);
  return <>{reverifying ? <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/30" /> : null}<dialog ref={ref} aria-labelledby={title} aria-describedby={description} aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) onDismiss(); }}
    className="fixed inset-0 z-[60] m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-black/10 bg-white p-6 text-[#171717] shadow-xl backdrop:bg-black/30">
    <h2 id={title} className="break-words text-xl font-medium tracking-tight">Delete {creator.name} forever?</h2>
    <div id={description} className="mt-3 space-y-2 text-sm leading-6 text-[#666]">
      <p>This permanently deletes their creator profile, all {creator.workCount} attributed works, and associated submissions and claims. This cannot be undone.</p>
      {creator.ownerUserId ? <p className="font-medium text-red-700">Their linked user account will also be closed, including its saved items and private submissions. Any sponsorship will follow the existing account-closure process.</p> : null}
    </div>
    <form action={formAction} className="mt-5 grid gap-4">
      <label htmlFor={field} className="grid gap-2 text-sm">Type <strong className="break-all">{expected}</strong> to confirm
        <input id={field} name="confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} autoComplete="off" spellCheck={false} className="focus-ring h-11 rounded-xl border border-black/20 px-3" />
      </label>
      <input type="hidden" name="creatorId" value={creator.id} />
      <input type="hidden" name="expectedUpdatedAt" value={creator.updatedAt} />
      <input type="hidden" name="expectedWorkCount" value={creator.workCount} />
      {state.status === "error" ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}
      <div className="flex justify-end gap-3">
        <button type="button" disabled={pending} onClick={onDismiss} className="focus-ring cursor-pointer rounded-full border border-black/10 px-4 py-2 text-sm disabled:opacity-40">Cancel</button>
        <button type="submit" disabled={pending || confirmation !== expected} className="focus-ring cursor-pointer rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Deleting…" : "Delete forever"}</button>
      </div>
    </form>
  </dialog></>;
}
