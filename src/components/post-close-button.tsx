"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  type PostDialogCloseMode,
  usePostDialogClose,
} from "./post-dialog";

export const postNavigationControlClassName =
  "focus-ring relative flex size-10 items-center justify-center rounded-full text-[#95959d] transition-colors before:absolute before:size-[34px] before:rounded-full before:border before:border-[#e6e6e6] before:bg-[#e6e6e6] before:transition-colors hover:text-[#505050] hover:before:bg-[#dcdcdc] xl:before:size-9 min-[1800px]:before:size-10 [&>svg]:relative [&>svg]:z-[1]";

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
