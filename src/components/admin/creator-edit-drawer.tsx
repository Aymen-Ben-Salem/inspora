"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { initialAdminActionState, type AdminActionState } from "@/features/admin/types";
import type { AdminCreatorRecord } from "@/features/creators/types";
import { AdminCreatorEditor, blankAdminCreator, toAdminCreatorDraft } from "./admin-creator-editor";
import { preserveFormDraft } from "./preserve-form-draft";

type Props = {
  creator?: AdminCreatorRecord;
  saveAction: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  onDismiss: () => void;
};

export function CreatorEditDrawer(props: Props) {
  return <CreatorEditSurface key={props.creator?.id ?? "new"} {...props} />;
}

function CreatorEditSurface({ creator: original, saveAction, onDismiss }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const formId = useId();
  const [creator, setCreator] = useState(() => original ? toAdminCreatorDraft(original) : blankAdminCreator());
  const [saveState, saveFormAction, isSaving] = useActionState(saveAction, initialAdminActionState);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    dialog.querySelector<HTMLInputElement>('[name="creatorName"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={isSaving}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!isSaving) onDismiss();
      }}
      onClick={(event) => {
        if (isSaving || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-none w-full max-w-[760px] overflow-hidden border-0 border-l border-black/10 bg-[#f5f5f2] p-0 text-[#171717] shadow-[-20px_0_60px_rgba(0,0,0,0.12)] backdrop:bg-black/30 open:flex open:flex-col">
      <header className="shrink-0 border-b border-black/10 bg-white px-5 py-6 sm:px-8">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-[#777]">Creator profile</p>
            <h2 id={titleId} className="mt-2 break-words text-3xl font-medium tracking-[-0.045em]">{original ? `Edit ${original.name}` : "Create creator"}</h2>
            <p className="mt-2 text-sm text-[#777]">{original ? "Update this creator’s details and profile links." : "Add a creator’s details and profile links."}</p>
          </div>
          <button type="button" onClick={onDismiss} disabled={isSaving} aria-label="Close creator editor" className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white hover:bg-[#f3f3f1] disabled:opacity-40">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
        <form id={formId} ref={preserveFormDraft} action={saveFormAction} className="grid min-w-0 gap-4">
          {saveState.status === "error" ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveState.message}</p> : null}
          <fieldset disabled={isSaving} className="min-w-0">
            <AdminCreatorEditor creator={creator} creators={original ? [original] : []} onChange={setCreator}
              showCreatorPicker={false} />
          </fieldset>
          {original ? <p className="text-xs text-[#777]">{original.recordOrigin} record · {original.workCount} credited works</p> : null}
        </form>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-black/10 bg-white px-5 py-4 sm:px-8">
        <button type="button" onClick={onDismiss} disabled={isSaving} className="focus-ring h-11 rounded-full border border-black/10 px-5 text-sm hover:bg-[#f3f3f1] disabled:opacity-40">Cancel</button>
        <button type="submit" form={formId} disabled={isSaving} className="focus-ring h-11 rounded-full bg-black px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
          {isSaving ? "Saving..." : original ? "Save creator" : "Create creator"}
        </button>
      </footer>
    </dialog>
  );
}
