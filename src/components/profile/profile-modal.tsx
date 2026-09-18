"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
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

export function ProfileModal({
  children,
  dirty = false,
  label,
  onDismiss,
  open,
}: {
  children: ReactNode;
  dirty?: boolean;
  label: string;
  onDismiss: () => void;
  open: boolean;
}) {
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const requestDismiss = useCallback(
    (reason: Exclude<DismissReason, "back">) => {
      const intent = modalDismissalIntent({ dirty, reason });
      if (
        intent === "confirm" &&
        !window.confirm("Discard your unsaved profile changes?")
      ) {
        return;
      }
      onDismiss();
    },
    [dirty, onDismiss],
  );

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const surface = surfaceRef.current;
    surface?.focus();

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestDismiss("escape");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestDismiss]);

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

  if (!open) return null;

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
        className={`${styles.surface} w-full max-w-[617px] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-[3px] border border-[#e6e6e6] bg-white p-6 text-[#262626] outline-none sm:p-10`}
      >
        <h2 id={titleId} className="text-[25px] font-medium leading-[normal] tracking-[-0.5px]">
          {label}
        </h2>
        {children}
      </div>
    </div>
  );
}
