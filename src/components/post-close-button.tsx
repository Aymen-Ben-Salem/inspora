"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  type PostDialogCloseMode,
  usePostDialogClose,
} from "./post-dialog";

export const postNavigationControlClassName =
  "detail-fit-nav-button focus-ring relative flex size-9 items-center justify-center border border-[#f0f0f0] bg-[#f0f0f0] text-[#767676] transition-opacity hover:opacity-80 sm:size-10 [&>img]:relative [&>img]:z-[1]";

export function PostCloseButton({
  className = "",
  closeMode,
  children,
  label = "Close post",
}: {
  className?: string;
  closeMode: PostDialogCloseMode;
  children: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const closeDialog = usePostDialogClose();

  function close() {
    if (closeDialog) {
      closeDialog();
      return;
    }

    if (closeMode === "back") {
      router.back();
      return;
    }

    if (closeMode === "custom") return;

    router.push("/");
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={close}
      className={`${postNavigationControlClassName} ${className}`}
    >
      {children}
    </button>
  );
}
