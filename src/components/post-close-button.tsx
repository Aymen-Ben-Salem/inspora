"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  type PostDialogCloseMode,
  usePostDialogClose,
} from "./post-dialog";

export const postNavigationControlClassName =
  "focus-ring relative flex size-9 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#7b7b7b] transition-colors hover:bg-[#dcdcdc] hover:text-[#262626] sm:size-10 lg:size-9 xl:size-10 [&>svg]:relative [&>svg]:z-[1]";

export function PostCloseButton({
  closeMode,
  children,
}: {
  closeMode: PostDialogCloseMode;
  children: ReactNode;
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

    router.push("/");
  }

  return (
    <button
      type="button"
      aria-label="Close post"
      onClick={close}
      className={postNavigationControlClassName}
    >
      {children}
    </button>
  );
}
