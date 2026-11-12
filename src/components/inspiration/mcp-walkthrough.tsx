"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Terminal } from "lucide-react";
import examples from "./mcp-examples.json";
import styles from "@/app/mcp/mcp.module.css";

export function McpWalkthrough() {
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("");
  const example = examples[selected];
  const request = `Find six ${example.prompt} on Inspora. Include creator credits and links.`;
  return (
    <div className={`ui app-frame ${styles.walkthrough}`}>
      <div className={styles.walkthroughSidebar}>
        <p className={styles.smallLabel}>Search walkthrough</p>
        <fieldset className={styles.exampleChoices}>
          <legend className="sr-only">Choose a recorded search</legend>
          {examples.map((item, index) => <button key={item.id} type="button" aria-pressed={index === selected} onClick={() => {setSelected(index); setStatus("");}}>
            <span>{item.label}</span><ArrowUpRight size={16} aria-hidden="true" />
          </button>)}
        </fieldset>
        <div className={styles.promptDetail}>
          <span className={styles.smallLabel}>Use this prompt</span>
          <p>{request}</p>
          <button type="button" className={`btn btn--secondary ${styles.copyPrompt}`} onClick={async () => {
            try { await navigator.clipboard.writeText(request); setStatus("Prompt copied."); }
            catch { setStatus("Copy is unavailable. Select the prompt text to copy it."); }
          }}>{status === "Prompt copied." ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{status === "Prompt copied." ? "Copied prompt" : "Copy prompt"}</button>
          <p className={styles.copyStatus} role="status">{status}</p>
        </div>
        <p className={styles.walkthroughNote}>Recorded from the local pilot. Search results depend on your catalog; image previews depend on your client.</p>
      </div>
      <div className={styles.walkthroughContent}>
        <div className={styles.resultToolbar}><span><Terminal size={16} aria-hidden="true" /> Inspora</span><span>6 references <span aria-hidden="true">↗</span></span></div>
        <div className={styles.referenceGrid} aria-live="polite" aria-atomic="true">
          {example.results.map(work => <a className={`card ${styles.reference}`} href={work.url} key={work.url}>
            <div className={styles.referenceHeading}><div><h3>{work.title}</h3><p>{work.creator}</p></div><ArrowUpRight size={16} aria-hidden="true" /></div>
            <div className="m-zoom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={work.image} srcSet={`${work.thumbnail} 200w, ${work.image} ${work.width}w`} sizes="(max-width:639px) 112px, (max-width:1023px) calc((100vw - 380px)/2), calc((100vw - 560px)/3)" alt={work.alt} width={work.width} height={work.height} loading="lazy" decoding="async" />
            </div>
            {work.match === "alternative" && <span className={styles.alternative}>Alternative · details unverified</span>}
          </a>)}
        </div>
      </div>
    </div>
  );
}

type MountedMoment = HTMLElement & { __moment?: {destroy?: () => void} };
type Effect = {destroy: () => void; pause: () => void};

/** The skill modules stay unmodified; this adapter gives them a route-scoped lifecycle. */
export function McpMotion() {
  useEffect(() => {
    let active = true;
    let effect: Effect | undefined;
    const html = document.documentElement;
    const root = document.querySelector<HTMLElement>("[data-mcp-page]");
    if (!root) return;
    const keys = {type:"software",radius:"sharp",buttons:"arrow",ground:"sand",motion:""};
    const previous = Object.fromEntries(Object.keys(keys).map(key => [key, html.getAttribute(`data-${key}`)]));
    Object.entries(keys).forEach(([key,value]) => html.setAttribute(`data-${key}`,value));
    html.classList.add("m-enter");
    const timer = window.setTimeout(() => html.classList.add("m-enter-done"),700);
    const importModule = (name: string) => import(/* webpackIgnore: true */ `/mcp/taste/${name}`);
    void (async () => {
      try {
        const motion = await importModule("motion/motion.js");
        if (!active) return;
        motion.init();
        const moments = await importModule("moments/moments.js");
        if (!active) return;
        const moment = root.querySelector<MountedMoment>("[data-moment]");
        if (moment) {
          await moments.mount(moment);
          if (!active) { moments.unmountAll(root); return; }
        }
        const fx = (await importModule("effects/fx.js")).default;
        if (!active) return;
        fx.config.maxDpr = 1;
        const ground = root.querySelector<HTMLElement>("[data-mcp-ground]");
        if (ground) {
          effect = await fx.mount(ground, "painterly-landscape", {
            seed: 17,
            palette: {bg:"#d9ccb7",surface:"#e9e0d2",ink:"#2a2622",muted:"#756c61",accent:"#a8794a",accentInk:"#ffffff"},
            params: {drift:0,blur:1,brush:0.35,slope:0,hillY:0.3,horizon:0.62,grain:0},
          });
          effect?.pause();
          if (!active) effect?.destroy();
        }
      } catch {
        // All content and the warm ground are present without enhancement.
        html.classList.add("m-enter-done", "mo-safe");
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timer);
      effect?.destroy();
      root.querySelector<MountedMoment>("[data-moment]")?.__moment?.destroy?.();
      Object.entries(previous).forEach(([key,value]) => value === null ? html.removeAttribute(`data-${key}`) : html.setAttribute(`data-${key}`,value));
      html.classList.remove("m-enter", "m-enter-done", "mo-js", "mo-safe");
      delete html.dataset.momentsReady;
    };
  }, []);
  return null;
}
