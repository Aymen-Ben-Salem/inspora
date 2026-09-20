"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import styles from "./profile-modal.module.css";

type DismissReason = "backdrop" | "escape" | "back";

export function modalDismissalIntent({
  dirty,
  reason,
}: {
  dirty: boolean;
  reason: DismissReason;
}) {
  if (reason === "back") return "back" as const;
  return dirty ? ("confirm" as const) : ("dismiss" as const);
}

export function nextContainedFocusIndex({
  current,
  count,
  shift,
}: {
  current: number;
  count: number;
  shift: boolean;
}) {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return (current + (shift ? -1 : 1) + count) % count;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function DiscardConfirmation({
  cancelRef,
  message,
  onCancel,
  onDiscard,
}: {
  cancelRef?: RefObject<HTMLButtonElement | null>;
  message: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed bottom-6 left-1/2 z-10 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[#e6e6e6] bg-white p-4 text-left shadow-[0_16px_48px_rgba(38,38,38,0.16)]"
    >
      <p id={titleId} className="text-sm font-medium tracking-[-0.14px] text-[#262626]">
        Discard changes?
      </p>
      <p id={descriptionId} className="mt-1 text-sm leading-5 tracking-[-0.14px] text-[#767676]">
        {message}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="focus-ring min-h-9 rounded-lg border border-[#e6e6e6] bg-white px-4 text-sm text-[#262626] shadow-[0_1px_1px_#e6e6e6]"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="focus-ring min-h-9 rounded-lg bg-[#262626] px-4 text-sm text-white shadow-[0_2px_0_#000]"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

type ProfileModalProps = {
  children: ReactNode;
  description?: string;
  discardMessage?: string;
  dirty?: boolean;
  label: string;
  onDismiss: () => void;
  open: boolean;
};

export function ProfileModal({ open, ...props }: ProfileModalProps) {
  return open ? <OpenProfileModal {...props} /> : null;
}

function OpenProfileModal({
  children,
  description,
  discardMessage = "Discard your unsaved profile changes?",
  dirty = false,
  label,
  onDismiss,
}: Omit<ProfileModalProps, "open">) {
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const confirmationFocusRef = useRef<HTMLElement | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const cancelDiscard = useCallback(() => {
    setConfirmationOpen(false);
    confirmationFocusRef.current?.focus();
  }, []);

  const requestDismiss = useCallback(
    (reason: Exclude<DismissReason, "back">) => {
      const intent = modalDismissalIntent({ dirty, reason });
      if (intent === "confirm") {
        confirmationFocusRef.current = document.activeElement as HTMLElement | null;
        setConfirmationOpen(true);
        return;
      }
      onDismiss();
    },
    [dirty, onDismiss],
  );

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const surface = surfaceRef.current;
    surface?.focus();

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (confirmationOpen) cancelConfirmationRef.current?.focus();
  }, [confirmationOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmationOpen) cancelDiscard();
        else requestDismiss("escape");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelDiscard, confirmationOpen, requestDismiss]);

  function containFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    if (
      (event.shiftKey && current <= 0) ||
      (!event.shiftKey && current === focusable.length - 1)
    ) {
      event.preventDefault();
      focusable[
        nextContainedFocusIndex({ current, count: focusable.length, shift: event.shiftKey })
      ]?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-white/45 px-4 py-8 backdrop-blur-[10px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestDismiss("backdrop");
      }}
    >
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={containFocus}
        className={`${styles.surface} flex w-full max-w-[617px] max-h-[calc(100dvh-4rem)] flex-col gap-3 overflow-y-auto rounded-[3px] border border-[#e6e6e6] bg-white p-6 text-[#262626] outline-none sm:p-10`}
      >
        <header className="flex flex-col gap-2 pb-3 pr-6">
          <h2 id={titleId} className="text-[25px] font-medium leading-[normal] tracking-[-0.5px]">
            {label}
          </h2>
          {description ? (
            <p className="text-sm leading-[normal] tracking-[-0.28px] text-[#767676]">
              {description}
            </p>
          ) : null}
        </header>
        {children}
        {confirmationOpen ? (
          <DiscardConfirmation
            cancelRef={cancelConfirmationRef}
            message={discardMessage}
            onCancel={cancelDiscard}
            onDiscard={() => {
              setConfirmationOpen(false);
              onDismiss();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
