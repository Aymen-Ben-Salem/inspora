"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// Line masks clip at the line box, which cuts descenders (g, y, p). Give each mask room below
// and above without moving the text.
const roomForDescenders = (masks: Element[]) => gsap.set(masks, { paddingTop: "0.06em", marginTop: "-0.06em", paddingBottom: "0.22em", marginBottom: "-0.22em" });

/**
 * Entrance and scroll motion for the MCP page. Everything is visible without scripts;
 * hidden states are applied before paint and only for motion-tolerant visitors.
 */
export function McpPageMotion() {
  useGSAP(() => {
    const root = document.querySelector<HTMLElement>("[data-mcp-page]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const q = <T extends Element = HTMLElement>(selector: string) => gsap.utils.toArray<T>(selector, root);

    // Hero: the headline rises line by line, then the supporting copy and the agent window.
    const title = root.querySelector<HTMLElement>("[data-hero-title]");
    if (title) {
      const split = SplitText.create(title, { type: "lines", mask: "lines", aria: "auto" });
      roomForDescenders(split.masks);
      gsap.from(split.lines, { yPercent: 110, duration: 1, stagger: 0.09, ease: "power4.out", delay: 0.05, onComplete: () => split.revert() });
    }
    gsap.from(q("[data-hero-fade]"), { autoAlpha: 0, y: 14, duration: 0.8, stagger: 0.08, ease: "power3.out", delay: 0.25, clearProps: "transform,opacity,visibility" });
    gsap.from(q("[data-hero-stage]"), { autoAlpha: 0, y: 40, scale: 0.98, duration: 1.1, ease: "power3.out", delay: 0.4, clearProps: "transform,opacity,visibility" });

    // Section headings and blocks reveal once as they enter.
    q("[data-reveal]").forEach(element => {
      gsap.from(element, { autoAlpha: 0, y: 28, duration: 0.9, ease: "power3.out", clearProps: "transform,opacity,visibility", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
    });
    ScrollTrigger.batch(q("[data-stagger]"), {
      start: "top 90%", once: true,
      onEnter: batch => gsap.from(batch, { autoAlpha: 0, y: 24, duration: 0.8, stagger: 0.08, ease: "power3.out", clearProps: "transform,opacity,visibility" }),
    });

    // Motion study frames arrive in time order; the palette bar fills to its measured shares.
    const frames = q("[data-frame]");
    if (frames.length) gsap.from(frames, { autoAlpha: 0, x: -24, duration: 0.7, stagger: 0.18, ease: "power3.out", clearProps: "transform,opacity,visibility", scrollTrigger: { trigger: frames[0], start: "top 85%", once: true } });
    const shares = q("[data-share]");
    if (shares.length) gsap.from(shares, { flexBasis: "0%", duration: 1.1, stagger: 0.12, ease: "power3.inOut", scrollTrigger: { trigger: shares[0], start: "top 85%", once: true } });
  }, []);
  return null;
}
