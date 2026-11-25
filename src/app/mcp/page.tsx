import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUpRight, Filter, Link2, ListChecks, PenTool, Plus, RefreshCw, Sparkles } from "lucide-react";
import { SiteNavbar } from "@/components/site-navbar";
import { McpClientSetup } from "@/components/inspiration/mcp-client-setup";
import { McpHeroDemo } from "@/components/inspiration/mcp-hero-demo";
import { McpPageMotion } from "@/components/inspiration/mcp-page-motion";
import { McpTryWith } from "@/components/inspiration/mcp-try-with";
import { McpWalkthrough } from "@/components/inspiration/mcp-walkthrough";
import { isMcpPreviewEnabled } from "@/features/inspiration/preview";
import styles from "./mcp.module.css";

const display = localFont({ src: "../../assets/fonts/mcp/schibsted.woff2", variable: "--mcp-display", display: "swap", weight: "400 700" });
const mono = localFont({ src: "../../assets/fonts/mcp/jetbrains-mono.woff2", variable: "--mcp-mono", display: "swap", weight: "400 500" });

export const metadata: Metadata = {
  title: "Inspora plugin for Claude Code and Codex — Preview",
  description: "Find credited design references from Inspora inside Claude Code and Codex.",
  robots: { index: false, follow: false },
  other: { "page-type": "software", "site-kind": "software" },
};

// Measured by the plugin for "Invite code interaction" by Nitish Khagwal (November 25, 2026).
const studyFrames = [["0-3s", "0.3s", "Closed"], ["1-0s", "1.0s", "Opening"], ["1-6s", "1.6s", "Open"]] as const;
const palette = { background: { hex: "#efefef" }, content: [{ hex: "#38d451", share: 66.4 }, { hex: "#242424", share: 33.6 }] };

const points = [
  { icon: Link2, title: "An idea or a link", text: "Describe the project, or share an Inspora link to find similar work." },
  { icon: Filter, title: "Filters that hold", text: "Kind, industry, style, color, website technology or logo shape." },
  { icon: ListChecks, title: "A real shortlist", text: "Up to ten direct matches, with close ideas labelled as adaptations." },
  { icon: PenTool, title: "From references to a direction", text: "Compare directions, write a brief or build from what you picked." },
  { icon: Sparkles, title: "Credit built in", text: "Every reference names its creator and links to the work." },
  { icon: RefreshCw, title: "Always current", text: "New work reaches the plugin soon after it’s published." },
];

const questions: { q: string; a: ReactNode }[] = [
  { q: "Which apps does it work with?", a: <p>Claude Code and Codex. Other MCP agents can connect with the <a href="https://mcp.inspora.design/setup" target="_blank" rel="noreferrer">setup guide</a>.</p> },
  { q: "Who can use it?", a: <p>It’s included with Inspora Pro. During the preview, only the Inspora team can sign in.</p> },
  { q: "Are there usage limits?", a: <p>Per account: 30 tool calls a minute, 500 a day and 3,000 new searches a month. If you hit one, your agent is told when to try again.</p> },
  { q: "What does Inspora receive?", a: <p>Only the searches your agent sends. It can’t read your files, code, conversations or saved collections.</p> },
  { q: "Can I search with an image?", a: <p>Not yet. Start from a description or an Inspora link.</p> },
  { q: "How do I update the plugin?", a: <p>Claude Code: <code>claude plugin marketplace update inspora-team</code>, then <code>claude plugin update inspora@inspora-team</code>. Codex: <code>codex plugin marketplace upgrade inspora-team</code>, then <code>codex plugin add inspora@inspora-team</code>.</p> },
];

export default function McpPage() {
  if (!isMcpPreviewEnabled()) notFound();
  return (
    <div className={`${styles.page} ${display.variable} ${mono.variable}`} data-mcp-page>
      <a className={styles.skip} href="#mcp-content">Skip to content</a>
      <SiteNavbar page="mcp" />
      <McpPageMotion />
      <main id="mcp-content">
        <section className={styles.hero} aria-labelledby="mcp-title">
          <div className={styles.wrap}>
            <div className={styles.heroCopy}>
              <div data-hero-fade><McpTryWith /></div>
              <h1 id="mcp-title" data-hero-title>Design references<br /> for your agent.</h1>
              <p className={styles.heroLead} data-hero-fade>Your agent searches Inspora’s curated design work, websites, logos and icons, and brings back credited references.</p>
              <div className={styles.actions} data-hero-fade>
                <a href="#setup" className={styles.primary}>Install the plugin <ArrowUpRight size={18} aria-hidden="true" /></a>
                <a href="#examples" className={styles.secondary}>See example searches <ArrowDown size={17} aria-hidden="true" /></a>
              </div>
            </div>
            <div className={styles.stage} data-hero-stage><McpHeroDemo /></div>
          </div>
        </section>

        <section id="setup" className={`${styles.section} ${styles.setup}`} aria-labelledby="setup-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead} data-reveal>
              <div><span className={styles.kicker}>Install</span><h2 id="setup-title">Ready in a minute.</h2></div>
              <p>Included with Inspora Pro. During the preview, only the Inspora team can sign in.</p>
            </div>
            <div className={styles.setupBody} data-reveal><McpClientSetup /></div>
            <p className={styles.setupNote} data-reveal>Using another agent? Follow the <a href="https://mcp.inspora.design/setup" target="_blank" rel="noreferrer">setup guide</a>.</p>
          </div>
        </section>

        <section id="examples" className={styles.section} aria-labelledby="examples-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead} data-reveal>
              <div><span className={styles.kicker}>Example searches</span><h2 id="examples-title">Ask the way you’d<br /> ask a designer.</h2></div>
              <p>Your agent checks the previews and comes back with a shortlist, every work credited and linked.</p>
            </div>
            <div data-reveal><McpWalkthrough /></div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.capabilities}`} aria-labelledby="capabilities-title">
          <div className={styles.wrap}>
            <div className={styles.sectionHead} data-reveal>
              <div><span className={styles.kicker}>What your agent gets</span><h2 id="capabilities-title">It sees the work,<br /> not just the words.</h2></div>
              <p>One install adds the Inspora connection and two skills for finding references and shaping a direction.</p>
            </div>
            <div className={styles.bento}>
              <article className={styles.feature} data-wide data-stagger>
                <div><h3>Motion, frame by frame</h3><p>Timestamped frames show how an interaction moves.</p></div>
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
                <div><h3>Exact colors</h3><p>Sampled from the work itself, apart from its background.</p></div>
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
              {points.map(({ icon: Icon, title, text }) => (
                <div key={title} className={styles.point} data-stagger>
                  <span className={styles.pointIcon}><Icon size={18} aria-hidden="true" /></span>
                  <h3>{title}</h3><p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="questions-title">
          <div className={`${styles.wrap} ${styles.faqGrid}`}>
            <div data-reveal><span className={styles.kicker}>Questions</span><h2 id="questions-title">Good to know.</h2></div>
            <div className={styles.faq} data-reveal>
              {questions.map(({ q, a }) => (
                <details key={q}>
                  <summary>{q}<Plus size={20} aria-hidden="true" /></summary>
                  <div className={styles.answer}>{a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.wrap}>
          <div className={styles.closingTop} data-reveal>
            <h2 id="closing-title">Start your next project with references.</h2>
            <a href="#setup" className={styles.primary}>Install the plugin <ArrowUpRight size={18} aria-hidden="true" /></a>
          </div>
          <Link className={styles.wordmark} href="/" data-wordmark>Inspora</Link>
          <div className={styles.legal}>
            <span>Inspora plugin · Preview for team review</span>
            <span>Claude Code and Codex are trademarks of their owners.</span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
