import type { CSSProperties } from "react";
import styles from "@/app/mcp/mcp.module.css";

// What the plugin does: six one-line points joined to the Inspora mark by equal lines
// (on phones, one vertical line under the mark). The wording is chosen so every point
// is about the same width (181–189px at 15px Inter), which keeps both sides even.
const left = ["Start from an idea or a link", "Filter by kind, style or color", "Up to ten direct references"];
const right = ["Compare, then write a brief", "Every reference is credited", "Always includes new work"];

const ROW = 72;
const HEIGHT = ROW * 3;
const MIDDLE = HEIGHT / 2;
const WIDTH = 105;
const rows = [ROW / 2, ROW * 1.5, ROW * 2.5];

// Each curve starts at a dot beside its point and ends at the mark.
function Links({ side }: { side: "left" | "right" }) {
  const outer = side === "left" ? 10 : WIDTH - 10;
  const inner = side === "left" ? WIDTH : 0;
  const bend = (outer + inner) / 2;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden="true">
      {rows.map((y, n) => {
        const d = `M${outer} ${y} C ${bend} ${y}, ${bend} ${MIDDLE}, ${inner} ${MIDDLE}`;
        const delay = { animationDelay: `${(side === "left" ? 0 : 0.7) + n * 1.4}s` } as CSSProperties;
        return (
          <g key={y}>
            <path d={d} className={styles.flowLine} data-line />
            <path d={d} className={styles.flowGlow} style={delay} />
            <path d={d} className={styles.flowPulse} style={delay} />
            <circle cx={outer} cy={y} r={3.5} className={styles.flowDot} data-dot />
          </g>
        );
      })}
    </svg>
  );
}

const Points = ({ items, side }: { items: string[]; side: "left" | "right" }) => (
  <ul className={styles.flowList} data-side={side}>
    {items.map(text => <li key={text} data-flow-item>{text}</li>)}
  </ul>
);

export function McpBenefits() {
  return (
    <div className={styles.flow} data-flow>
      <div className={styles.flowHub} aria-hidden="true" data-hub>
        <svg viewBox="8 10 48 44" width={26} height={24}><path fill="currentColor" d="M8 54V10h27.5C46.82 10 56 19.18 56 30.5V54H41.5V32c0-4.14-3.36-7.5-7.5-7.5H22.5V54H8Z" /></svg>
      </div>
      <Points items={left} side="left" />
      <Links side="left" />
      <Links side="right" />
      <Points items={right} side="right" />
    </div>
  );
}
