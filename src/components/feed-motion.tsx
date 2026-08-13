"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type PropsWithChildren, useRef } from "react";

gsap.registerPlugin(useGSAP);

export function FeedMotion({
  children,
  itemCount,
}: PropsWithChildren<{ itemCount: number }>) {
  const scope = useRef<HTMLDivElement>(null);
  const initialFeedRevealed = useRef(false);

  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>(
        "[data-feed-card]:not([data-feed-revealed])",
      );

      cards.forEach((card) => {
        card.dataset.feedRevealed = "";
      });

      // The initial feed is already visible content, so delaying it behind an
      // entrance animation postpones LCP. Keep motion for newly appended pages.
      if (!initialFeedRevealed.current) {
        initialFeedRevealed.current = true;
        return;
      }

      if (
        cards.length === 0 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      gsap.fromTo(
        cards,
        { autoAlpha: 0, y: 14, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          stagger: 0.035,
          ease: "power3.out",
          clearProps: "transform,opacity,visibility",
        },
      );
    },
    { scope, dependencies: [itemCount] },
  );

  return <div ref={scope}>{children}</div>;
}
