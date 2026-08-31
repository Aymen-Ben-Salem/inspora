"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 size-full animate-[sheet-backdrop-in_220ms_ease-out_both] bg-black/20 motion-reduce:animate-none"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{ width: "min(100dvw, 720px)" }}
        className="relative z-[1] max-h-[calc(100dvh-16px)] max-w-[720px] animate-[sheet-rise-in_300ms_cubic-bezier(0.22,1,0.36,1)_both] overflow-y-auto rounded-t-[18px] border border-black/10 bg-white px-6 pb-[max(32px,env(safe-area-inset-bottom))] pt-14 shadow-[0_-20px_60px_rgba(0,0,0,0.12)] motion-reduce:animate-none sm:rounded-t-[20px] sm:px-12 sm:pb-12 sm:pt-16"
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="focus-ring absolute right-5 top-5 flex size-9 items-center justify-center text-[#777] transition-colors hover:text-[#262626] sm:right-7 sm:top-7"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mx-auto max-w-[480px] text-center">
          <h2 id={titleId} className="text-[25px] font-medium tracking-[-0.035em] text-[#262626] sm:text-[29px]">
            {title}
          </h2>
          <p id={descriptionId} className="mx-auto mt-3 max-w-[420px] text-[15px] leading-6 text-[#777] sm:text-[16px]">
            {description}
          </p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
