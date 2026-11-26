import { ArrowRight, ArrowUpRight, Check, Link2 } from "lucide-react";
import styles from "@/app/mcp/mcp.module.css";

// Small drawn scenes for what the plugin does. Decorative: each tile's heading and text carry the meaning.
function StartAnywhere() {
  return (
    <div className={styles.artStack}>
      <span className={styles.artInput} data-pop><span className={styles.artCaret}>›</span>Onboarding for a fintech app</span>
      <span className={styles.artOr} data-pop>or</span>
      <span className={styles.artInput} data-pop><Link2 size={13} />inspora.design/posts/onboarding-flow</span>
      <span className={styles.artChips}>
        <span data-pop data-on>Design</span>
        <span data-pop data-on>Minimal</span>
        <span data-pop><i style={{ background: "#38d451" }} />Green</span>
        <span data-pop>Fintech</span>
      </span>
    </div>
  );
}

function DirectMatches() {
  return (
    <div className={styles.artStack}>
      <span className={styles.artCount} data-pop><strong>10</strong> direct matches</span>
      <span className={styles.artMatches}>
        {Array.from({ length: 10 }, (_, n) => <span key={n} data-pop><Check size={9} strokeWidth={3} /></span>)}
      </span>
      <span className={styles.artAdapt} data-pop>
        <span /><span />
        <em>Adaptations, labelled</em>
      </span>
    </div>
  );
}

function CompareBrief() {
  return (
    <div className={styles.artCompare}>
      <span className={styles.artOptions}>
        {[["A", ["#e8e3d9", "#1f3b2d", "#c7a45a"]], ["B", ["#f2f2f2", "#262626", "#4f7cff"]]].map(([label, colors]) => (
          <span key={label as string} className={styles.artOption} data-pop>
            <b>Direction {label as string}</b>
            <span className={styles.artSwatches}>{(colors as string[]).map(color => <i key={color} style={{ background: color }} />)}</span>
            <span className={styles.artLine} /><span className={styles.artLine} data-short />
          </span>
        ))}
      </span>
      <ArrowRight size={16} className={styles.artArrow} />
      <span className={styles.artBrief} data-pop>
        <b>Design brief</b>
        <span className={styles.artLine} data-grow /><span className={styles.artLine} data-grow /><span className={styles.artLine} data-grow data-short />
        <span className={styles.artTags}><span>Layout</span><span>Type</span><span>Color</span></span>
      </span>
    </div>
  );
}

function CreditedCurrent() {
  return (
    <div className={styles.artStack}>
      <span className={styles.artCredit} data-pop>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mcp/study/invite-code-1-0s.webp" alt="" width={480} height={200} loading="lazy" decoding="async" />
        <span><b>Invite code interaction</b><small>by Nitish Khagwal</small></span>
        <ArrowUpRight size={14} />
      </span>
      <span className={styles.artSync} data-pop><i />New work synced automatically</span>
    </div>
  );
}

const points = [
  { title: "Start anywhere", text: "From an idea or an Inspora link, then filter by kind, style, color and more.", Art: StartAnywhere },
  { title: "Direct matches first", text: "Up to ten references that fit, with adaptations labelled separately.", Art: DirectMatches },
  { title: "Compare, then brief", text: "Weigh directions side by side and turn the one you like into a design brief.", Art: CompareBrief },
  { title: "Credited and current", text: "Every reference credited and linked. New work arrives automatically.", Art: CreditedCurrent },
];

export function McpBenefits() {
  return (
    <ul className={styles.points}>
      {points.map(({ title, text, Art }) => (
        <li key={title} className={styles.point} data-stagger>
          <div className={styles.art} aria-hidden="true" data-art><Art /></div>
          <h3>{title}</h3>
          <p>{text}</p>
        </li>
      ))}
    </ul>
  );
}
