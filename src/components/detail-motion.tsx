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
      className={`flex min-w-0 snap-x snap-mandatory items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none] [container-type:size] [&::-webkit-scrollbar]:hidden ${
        overlay
          ? "h-[46%] min-h-0 flex-none bg-gradient-to-b from-white to-[#d2d1d1] lg:h-full lg:flex-1"
          : "min-h-[62dvh] flex-1 bg-[#262626]"
      }`}
    >
      {children}
    </div>
  );
}
