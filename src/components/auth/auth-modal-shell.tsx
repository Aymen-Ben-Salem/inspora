"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function AuthModalShell({
  label,
  backdrop,
  children,
}: {
  label: string;
  backdrop: ReactNode;
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
    <div className="relative isolate min-h-[100dvh] overflow-hidden bg-white text-[#262626]">
      <div
        aria-hidden="true"
        inert
        data-auth-backdrop
        className="pointer-events-none absolute inset-[-8px] select-none overflow-hidden blur-[5px]"
      >
        {backdrop}
      </div>

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
