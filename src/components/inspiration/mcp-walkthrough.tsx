"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import examples from "./mcp-examples.json";
import styles from "@/app/mcp/mcp.module.css";

gsap.registerPlugin(useGSAP);

const kindLabel: Record<string, string> = { design: "Design", website: "Website", logo: "Logo", icon: "Icon" };

/** Searches recorded with the Inspora plugin, shown as the agent's credited shortlist. */
export function McpWalkthrough() {
  const scope = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState("");
  const example = examples[selected];
  const request = `Find ${example.prompt} on Inspora. Show ten with creator credits and links.`;

  useGSAP(() => {
    const root = scope.current!;
    const tab = tabs.current[selected];
    const indicator = root.querySelector<HTMLElement>("[data-indicator]")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (tab) gsap.to(indicator, { x: tab.offsetLeft, width: tab.offsetWidth, duration: mounted.current && !reduced ? 0.45 : 0, ease: "power3.out" });
    if (!mounted.current || reduced) { mounted.current = true; return; }
    gsap.fromTo("[data-reference]", { autoAlpha: 0, y: 16, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.05, ease: "power3.out", clearProps: "transform,opacity,visibility" });
    gsap.fromTo("[data-quote]", { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  }, { scope, dependencies: [selected] });

  function choose(next: number) {
    setSelected(next);
    setCopied("");
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? examples.length - 1 : (selected + step + examples.length) % examples.length;
    if (!step && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    choose(target);
    tabs.current[target]?.focus();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(request); setCopied("Prompt copied."); }
    catch { setCopied("Copy isn’t available here. Select the prompt to copy it."); }
  }

  return (
    <div ref={scope} className={styles.walkthrough}>
      <div className={styles.tabs} role="tablist" aria-label="Example searches" onKeyDown={onKey} style={{ position: "relative" }}>
        <span className={styles.tabIndicator} data-indicator aria-hidden="true" />
        {examples.map((item, index) => (
          <button key={item.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`example-tab-${item.id}`}
            aria-selected={index === selected} aria-controls="example-panel" tabIndex={index === selected ? 0 : -1} onClick={() => choose(index)}>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.panel} role="tabpanel" id="example-panel" aria-labelledby={`example-tab-${example.id}`}>
        <div className={styles.panelHead}>
          <div data-quote>
            <span className={styles.smallLabel}>You ask</span>
            <p className={styles.promptQuote}>“{request}”</p>
          </div>
          <button type="button" className={styles.copyButton} onClick={copy}>
            {copied === "Prompt copied." ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied === "Prompt copied." ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <p className={styles.srOnly} role="status">{copied}</p>
        <div className={styles.referenceGrid}>
          {example.results.map(work => (
            <a key={work.url} href={work.url} className={styles.reference} data-reference>
              <span className={styles.thumb} data-fit={work.kind === "logo" || work.kind === "icon" ? "contain" : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={work.image} srcSet={`${work.thumbnail} ${work.thumbnailWidth}w, ${work.image} ${work.width}w`}
                  sizes="(max-width:639px) 45vw, (max-width:1023px) 44vw, 400px" alt={work.alt} width={work.width} height={work.height} loading="lazy" decoding="async" />
                <span className={styles.badges}>
                  <span className={styles.badge}>{kindLabel[work.kind]}</span>
                  {"motion" in work && work.motion ? <span className={styles.badge} data-motion>Motion</span> : null}
                </span>
              </span>
              <span className={styles.referenceMeta}>
                <span><h3>{work.title}</h3><p>{work.creator}</p></span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
        <p className={styles.panelNote}>Recorded with the Inspora plugin on November 25, 2026. The first six references are shown, each linking to the work and its creator on Inspora. Results change as new work is added.</p>
      </div>
    </div>
  );
}
