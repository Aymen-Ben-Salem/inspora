"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import examples from "./mcp-examples.json";
import styles from "@/app/mcp/mcp.module.css";

gsap.registerPlugin(useGSAP);

// Design work leads; websites follow. Each is a search recorded with the plugin.
const searches = ["dashboards", "interactions", "landing-pages", "onboarding"].map(id => examples.find(example => example.id === id)!);
const HOLD_SECONDS = 5.5;

/** Replays recorded searches: the prompt types, then the references arrive. */
export function McpHeroDemo() {
  const scope = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const run = useRef({ first: true, visible: true, held: false, chosen: false });
  const search = searches[index];
  const prompt = `Find ${search.prompt} on Inspora`;

  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => { run.current.visible = entry.isIntersecting; }, { threshold: 0.25 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useGSAP((_context, contextSafe) => {
    const root = scope.current!;
    const demo = root.querySelector<HTMLElement>("[data-demo]")!;
    const full = root.querySelector<HTMLElement>("[data-full]")!;
    const typed = root.querySelector<HTMLElement>("[data-typed]")!;
    const status = root.querySelector<HTMLElement>("[data-status]")!;
    const cards = gsap.utils.toArray<HTMLElement>("[data-card]", root);
    const bar = root.querySelector<HTMLElement>(`[data-progress="${index}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = run.current.first;
    run.current.first = false;
    if (reduced) return;

    const advance = contextSafe!(() => {
      if (run.current.chosen) return;
      const { visible, held } = run.current;
      if (!visible || held || document.hidden) { gsap.delayedCall(0.8, advance); return; }
      gsap.timeline({ onComplete: () => setIndex(current => (current + 1) % searches.length) })
        .to(cards, { autoAlpha: 0, y: -10, duration: 0.28, stagger: 0.03, ease: "power2.in" })
        .to(status, { autoAlpha: 0, duration: 0.2 }, "<");
    });

    // Hidden before paint; the server-rendered page shows the finished search.
    gsap.set(full, { color: "transparent" });
    gsap.set(status, { autoAlpha: 0 });
    gsap.set(cards, { autoAlpha: 0, y: 18, scale: 0.96 });
    typed.textContent = "";
    demo.dataset.typing = "";
    const letters = { count: 0 };
    const timeline = gsap.timeline({ delay: first ? 0.7 : 0.15 });
    timeline
      .to(letters, { count: prompt.length, duration: Math.min(1.5, prompt.length * 0.035), ease: "none", onUpdate: () => { typed.textContent = prompt.slice(0, Math.round(letters.count)); } })
      .add(() => { delete demo.dataset.typing; gsap.set(full, { clearProps: "color" }); typed.textContent = ""; })
      .to(status, { autoAlpha: 1, duration: 0.3 }, "+=0.2")
      .to(cards, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.07, ease: "power3.out", clearProps: "transform" }, "<0.05");
    if (bar && !run.current.chosen) timeline.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: HOLD_SECONDS, ease: "none" }, "<");
    if (!run.current.chosen) timeline.add(() => { gsap.delayedCall(0.1, advance); });
  }, { scope, dependencies: [index] });

  const choose = (next: number) => { run.current.chosen = true; setIndex(next); };

  return (
    <div ref={scope} onPointerEnter={() => { run.current.held = true; }} onPointerLeave={() => { run.current.held = false; }}
      onFocus={() => { run.current.held = true; }} onBlur={() => { run.current.held = false; }}>
      <div className={styles.demo} data-demo>
        <div className={styles.demoBar} aria-hidden="true">
          <span className={styles.demoDots}><i /><i /><i /></span>
          <span>Claude Code</span>
          <span>inspora · search_inspiration</span>
        </div>
        <div className={styles.demoBody}>
          <p className={styles.demoPrompt}>
            <span aria-hidden="true">›</span>
            <span className={styles.promptText}><span data-full>{prompt}</span><span data-typed aria-hidden="true" /></span>
          </p>
          <p className={styles.demoStatus} data-status><CircleCheck size={14} aria-hidden="true" />Searched Inspora · showing {search.results.length} references</p>
          <div className={styles.demoGrid} aria-live="polite">
            {search.results.map((work, position) => (
              <div key={work.url} className={styles.demoCard} data-card>
                <span className={styles.thumb} data-fit={work.kind === "logo" || work.kind === "icon" ? "contain" : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={work.thumbnail} srcSet={`${work.thumbnail} ${work.thumbnailWidth}w, ${work.image} ${work.width}w`}
                    sizes="(max-width:639px) 30vw, (max-width:1023px) 28vw, 180px" alt={work.alt} width={work.width} height={work.height}
                    loading={index === 0 && position < 6 ? "eager" : "lazy"} fetchPriority={index === 0 && position < 3 ? "high" : undefined} decoding="async" />
                </span>
                <span className={styles.demoMeta}>{work.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.demoTabs}>
        {searches.map((item, position) => (
          <button key={item.id} type="button" aria-pressed={position === index} onClick={() => choose(position)}>
            {item.label}
            {position === index ? <span className={styles.progress} data-progress={position} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
