"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { PropsWithChildren, useRef } from "react";

gsap.registerPlugin(useGSAP);

export function DetailMotion({
  children,
  overlay = false,
}: PropsWithChildren<{ overlay?: boolean }>) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (overlay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      gsap.fromTo(
        "[data-detail-media]",
        { autoAlpha: 0, scale: 0.985 },
        { autoAlpha: 1, scale: 1, duration: 0.65, ease: "power3.out", stagger: 0.08 },
      );
    },
    { scope, dependencies: [overlay] },
  );

  return (
    <div
      ref={scope}
      data-post-dialog-gallery={overlay ? "" : undefined}
      className={`flex min-h-[62dvh] min-w-0 flex-1 snap-x snap-mandatory items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[100dvh] ${
        overlay ? "bg-transparent" : "bg-[#262626]"
      }`}
    >
      {children}
    </div>
  );
}
