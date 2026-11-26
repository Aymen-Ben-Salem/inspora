"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";
import styles from "./previous.module.css";

gsap.registerPlugin(useGSAP);

const apps = [
  { name: "Claude Code", icon: "/mcp/icons/claude-code.svg" },
  { name: "Codex", icon: "/mcp/icons/codex.svg" },
];

/** "Try it now with" followed by the app name, alternating every few seconds. */
export function McpTryWith() {
  const scope = useRef<HTMLParagraphElement>(null);
  const [index, setIndex] = useState(0);
  const app = apps[index];

  useGSAP((_context, contextSafe) => {
    const root = scope.current!;
    const slot = root.querySelector<HTMLElement>("[data-slot]")!;
    const item = root.querySelector<HTMLElement>("[data-app]")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Measure the new name at its natural width, not squeezed into the previous name's width.
    const previous = slot.style.width;
    slot.style.width = "auto";
    const width = slot.offsetWidth;
    slot.style.width = previous;
    if (slot.dataset.width && !reduced) {
      gsap.fromTo(slot, { width: Number(slot.dataset.width) }, { width, duration: 0.45, ease: "power3.inOut" });
      gsap.fromTo(item, { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out", delay: 0.1 });
    } else gsap.set(slot, { width });
    slot.dataset.width = String(width);
    const next = contextSafe!(() => {
      if (reduced || document.hidden) { setIndex(current => (current + 1) % apps.length); return; }
      gsap.to(item, { yPercent: -100, autoAlpha: 0, duration: 0.35, ease: "power2.in", onComplete: () => setIndex(current => (current + 1) % apps.length) });
    });
    gsap.delayedCall(2.8, next);
  }, { scope, dependencies: [index] });

  return (
    <p ref={scope} className={styles.eyebrow}>
      <span>Try it now with</span>
      <span className={styles.trySlot} data-slot aria-hidden="true">
        <span className={styles.tryApp} data-app>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.icon} alt="" width={18} height={18} />{app.name}
        </span>
      </span>
      <span className={styles.srOnly}>Claude Code or Codex</span>
    </p>
  );
}
