"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { initialAdminActionState, type AdminActionState } from "@/features/admin/types";
import type { AdminCreatorRecord } from "@/features/creators/types";

export function CreatorTrashDialog({ creator, action, onDismiss }: {
  creator: AdminCreatorRecord;
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [state, formAction, pending] = useActionState(async (previous: AdminActionState, data: FormData) => {
    const result = await action(previous, data);
    if (result.status !== "error") onDismiss();
    return result;
  }, initialAdminActionState);

  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>('button[type="button"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) onDismiss(); }}
    onClick={event => {
      if (pending || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
    }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-black/10 bg-white p-6 text-[#171717] shadow-xl backdrop:bg-black/30">
    <h2 id={titleId} className="break-words text-xl font-medium tracking-tight">Move {creator.name} to Trash?</h2>
    <p id={descriptionId} className="mt-3 text-sm leading-6 text-[#666]">Their profile and work will be hidden from the public site. You can restore both from the Trash tab in Creators.</p>
    {state.status === "error" ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}
    <form action={formAction} className="mt-6 flex justify-end gap-3">
      <input type="hidden" name="creatorId" value={creator.id} />
      <input type="hidden" name="operation" value="trash" />
      <button type="button" onClick={onDismiss} disabled={pending} className="focus-ring cursor-pointer rounded-full border border-black/10 px-4 py-2 text-sm hover:bg-[#f3f3f1] disabled:cursor-wait disabled:opacity-40">Cancel</button>
      <button type="submit" disabled={pending} className="focus-ring cursor-pointer rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-40">{pending ? "Moving…" : "Move to Trash"}</button>
    </form>
  </dialog>;
}
