"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type PropsWithChildren, useRef } from "react";

gsap.registerPlugin(useGSAP);

export function FeedMotion({
  children,
  itemCount,
  animateOnMount = true,
}: PropsWithChildren<{ itemCount: number; animateOnMount?: boolean }>) {
  const scope = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  useGSAP(
    () => {
      const isFirstMount = !hasMounted.current;
      hasMounted.current = true;
      const cards = gsap.utils.toArray<HTMLElement>(
        "[data-feed-card]:not([data-feed-revealed])",
      );

      cards.forEach((card) => {
        card.dataset.feedRevealed = "";
      });

      if (
        (isFirstMount && !animateOnMount) ||
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
    { scope, dependencies: [itemCount, animateOnMount] },
  );

  return <div ref={scope}>{children}</div>;
}
