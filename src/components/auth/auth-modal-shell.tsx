"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function AuthModalShell({
  label,
  backdrop,
  overlay = false,
  children,
}: {
  label: string;
  backdrop?: ReactNode;
  overlay?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  function dismissAuth(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.replace("/");
  }

  return (
    <div
      data-auth-overlay={overlay || undefined}
      className={
        overlay
          ? "fixed inset-0 z-[110] isolate overflow-y-auto text-[#262626]"
          : "relative isolate min-h-[100dvh] overflow-hidden bg-white text-[#262626]"
      }
    >
      {overlay ? (
        <div
          aria-hidden="true"
          data-auth-backdrop
          className="pointer-events-none absolute inset-0 backdrop-blur-[5px]"
        />
      ) : (
        <div
          aria-hidden="true"
          inert
          data-auth-backdrop
          className="pointer-events-none absolute inset-[-8px] select-none overflow-hidden blur-[5px]"
        >
          {backdrop}
        </div>
      )}

      <div
        data-auth-dismiss
        className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-8 sm:px-8 sm:py-12"
        onClick={dismissAuth}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="w-full max-w-[429px]"
        >
          {children}
        </section>
      </div>
    </div>
  );
}
