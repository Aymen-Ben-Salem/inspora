import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { SiteNavbar } from "@/components/site-navbar";
import { McpClientSetup } from "@/components/inspiration/mcp-client-setup";
import { McpHeroDemo } from "@/components/inspiration/mcp-hero-demo";
import { McpPageMotion } from "@/components/inspiration/mcp-page-motion";
import { McpTryWith } from "@/components/inspiration/mcp-try-with";
import { isMcpPreviewEnabled } from "@/features/inspiration/preview";
import styles from "./mcp.module.css";

export const metadata: Metadata = {
  title: "Inspora plugin for Claude Code and Codex — Preview",
  description: "Find credited design references from Inspora inside Claude Code and Codex.",
  robots: { index: false, follow: false },
  other: { "page-type": "software", "site-kind": "software" },
};

// Measured by the plugin for "Invite code interaction" by Nitish Khagwal (November 25, 2026).
const studyFrames = [["0-3s", "0.3s", "Closed"], ["1-0s", "1.0s", "Opening"], ["1-6s", "1.6s", "Open"]] as const;
const palette = { background: { hex: "#efefef" }, content: [{ hex: "#38d451", share: 66.4 }, { hex: "#242424", share: 33.6 }] };
const extras = [
  "Start from an idea or an Inspora link, then filter by style, color and more.",
  "Up to ten direct matches, with adaptations labelled.",
  "Compare directions or turn them into a design brief.",
  "Every reference credited, with new work added automatically.",
];

const questions: { q: string; a: ReactNode }[] = [
  { q: "Which apps does it work with?", a: <p>Claude Code and Codex.</p> },
  { q: "Who can use it?", a: <p>It’s included with Inspora Pro. During the preview, only the Inspora team can sign in.</p> },
  { q: "Are there usage limits?", a: <p>Per account: 30 tool calls a minute, 500 a day and 3,000 new searches a month. If you hit one, your agent is told when to try again.</p> },
  { q: "What does Inspora receive?", a: <p>Only the searches your agent sends. It can’t read your files, code, conversations or saved collections.</p> },
  { q: "Can I search with an image?", a: <p>Not yet. Start from a description or an Inspora link.</p> },
  { q: "How do I update the plugin?", a: <p>Claude Code: <code>claude plugin marketplace update inspora-team</code>, then <code>claude plugin update inspora@inspora-team</code>. Codex: <code>codex plugin marketplace upgrade inspora-team</code>, then <code>codex plugin add inspora@inspora-team</code>.</p> },
];

export default function McpPage() {
  if (!isMcpPreviewEnabled()) notFound();
  return (
    <div className={styles.page} data-mcp-page>
      <a className={styles.skip} href="#mcp-content">Skip to content</a>
      <SiteNavbar page="mcp" />
      <McpPageMotion />
      <main id="mcp-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="mcp-title">
          <div className={styles.heroCopy}>
            <div data-hero-fade><McpTryWith /></div>
            <h1 id="mcp-title" data-hero-title>Design references<br /> for your agent.</h1>
            <p className={styles.heroLead} data-hero-fade>Your agent searches Inspora’s curated design work, websites, logos and icons, and brings back credited references.</p>
          </div>
          <div className={styles.actions} data-hero-fade>
            <a href="#setup" className={styles.primary}>Install the plugin</a>
          </div>
          <div className={styles.stage} data-hero-stage><McpHeroDemo /></div>
        </section>

        <section id="setup" className={`${styles.section} ${styles.band}`} aria-labelledby="setup-title">
          <h2 id="setup-title" className={styles.intro} data-reveal><span>Ready in a minute.</span> Included with Inspora Pro, team-only during the preview.</h2>
          <div className={styles.section} data-reveal><McpClientSetup /></div>
        </section>

        <section className={styles.section} aria-labelledby="capabilities-title">
          <h2 id="capabilities-title" className={styles.intro} data-reveal><span>It sees the work, not just the words.</span> Your agent looks at previews, motion frames and colors, not only descriptions.</h2>
          <div className={styles.features}>
            <article className={styles.feature} data-stagger>
              <div><h3>Motion, frame by frame</h3><p>For animated work, your agent gets timestamped frames, so it can see how an interaction moves before it builds one.</p></div>
              <div>
                <div className={styles.frames}>
                  {studyFrames.map(([file, time, state]) => (
                    <figure key={file} className={styles.frame} data-frame>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/mcp/study/invite-code-${file}.webp`} alt={`Invite code interaction, ${state.toLowerCase()} at ${time}`} width={480} height={200} loading="lazy" decoding="async" />
                      <figcaption>{time}</figcaption>
                    </figure>
                  ))}
                </div>
                <p className={styles.featureCredit}><Link href="/posts/invite-code-interaction">Invite code interaction</Link> by Nitish Khagwal</p>
              </div>
            </article>
            <article className={styles.feature} data-stagger>
              <div><h3>Colors measured from the design</h3><p>Each preview comes with colors sampled from the work itself, kept apart from its background.</p></div>
              <div className={styles.palette}>
                <div className={styles.paletteBar} role="img" aria-label="Measured colors: green #38d451, 66 percent; near-black #242424, 34 percent">
                  {palette.content.map(color => <span key={color.hex} data-share style={{ flex: `0 0 ${color.share}%`, background: color.hex }} />)}
                </div>
                <div className={styles.swatches}>
                  {palette.content.map(color => <span key={color.hex}><i style={{ background: color.hex }} />{color.hex} · {Math.round(color.share)}%</span>)}
                  <span><i style={{ background: palette.background.hex }} />{palette.background.hex} · background</span>
                </div>
              </div>
            </article>
          </div>
          <ul className={styles.benefits} data-stagger>
            {extras.map(text => <li key={text}><Image src="/sponsorship/star.svg" alt="" width={20} height={20} />{text}</li>)}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="questions-title">
          <h2 id="questions-title" className={styles.intro} data-reveal><span>Good to know.</span></h2>
          <div className={styles.faq} data-reveal>
            {questions.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<Plus size={18} aria-hidden="true" /></summary>
                <div className={styles.answer}>{a}</div>
              </details>
            ))}
          </div>
        </section>

        <footer className={styles.closing} aria-labelledby="closing-title" data-reveal>
          <div className={styles.closingCopy}>
            <p className={styles.intro}>Included with <span>Inspora Pro.</span></p>
            <h2 id="closing-title" className={styles.closingTitle}>Start your next project with references.</h2>
          </div>
          <a href="#setup" className={styles.primary}>Install the plugin</a>
          <div className={styles.links}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <p className={styles.small}>Preview for team review. Claude Code and Codex are trademarks of their owners.</p>
        </footer>
      </main>
    </div>
  );
}
