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
    // "What it does": the Inspora mark appears, lines draw out to each point, then the points arrive.
    const flow = root.querySelector<HTMLElement>("[data-flow]");
    if (flow) {
      const inFlow = (selector: string) => gsap.utils.toArray<Element>(selector, flow);
      const lines = inFlow("[data-line]") as SVGPathElement[];
      const length = (line: SVGPathElement) => { try { return line.getTotalLength(); } catch { return 160; } };
      gsap.timeline({ scrollTrigger: { trigger: flow, start: "top 80%", once: true } })
        .from(inFlow("[data-hub]"), { autoAlpha: 0, scale: 0.6, duration: 0.7, ease: "back.out(1.7)", clearProps: "transform,opacity,visibility" })
        .fromTo(lines, { strokeDasharray: (_: number, line: SVGPathElement) => length(line), strokeDashoffset: (_: number, line: SVGPathElement) => -length(line) },
          { strokeDashoffset: 0, duration: 0.9, stagger: 0.07, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, "-=0.35")
        .from(inFlow("[data-tail]"), { scaleX: 0, transformOrigin: (_: number, tail: Element) => tail.closest("[data-side=left]") ? "right center" : "left center", duration: 0.5, stagger: 0.05, ease: "power2.out", clearProps: "transform" }, "-=0.4")
        .from(inFlow("[data-flow-item]"), { autoAlpha: 0, y: 6, duration: 0.5, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity,visibility" }, "-=0.5");
    }
    const shares = q("[data-share]");
    if (shares.length) gsap.from(shares, { flexBasis: "0%", duration: 1.1, stagger: 0.12, ease: "power3.inOut", scrollTrigger: { trigger: shares[0], start: "top 85%", once: true } });
  }, []);
  return null;
}
