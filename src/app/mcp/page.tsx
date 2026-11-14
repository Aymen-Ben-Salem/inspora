import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { SiteNavbar } from "@/components/site-navbar";
import { McpClientSetup } from "@/components/inspiration/mcp-client-setup";
import { McpWalkthrough, McpMotion } from "@/components/inspiration/mcp-walkthrough";
import examples from "@/components/inspiration/mcp-examples.json";
import { isMcpPreviewEnabled } from "@/features/inspiration/preview";
import styles from "./mcp.module.css";

const display = localFont({ src: "../../assets/fonts/mcp/schibsted.woff2", variable: "--mcp-display", display: "swap", weight: "400 700" });
const mono = localFont({ src: "../../assets/fonts/mcp/jetbrains-mono.woff2", variable: "--mcp-mono", display: "swap", weight: "400 500" });

export const metadata: Metadata = {
  title: "Inspora MCP — Preview",
  description: "Find design references from Claude Code and Codex with Inspora's hosted MCP team trial.",
  robots: { index: false, follow: false },
  other: { "page-type": "software", "site-kind": "software" },
};

export default function McpPage() {
  if (!isMcpPreviewEnabled()) notFound();
  return (
    <div className={`${styles.page} ${display.variable} ${mono.variable}`} data-mcp-page>
      {/* Taste deal: centred / white-link-blue / Schibsted / sand / dark-band / arrow / letters-assemble.
          Inspora's shared navigation and wordmark are retained for this existing product route. */}
      <a className={styles.skip} href="#mcp-content">Skip to MCP content</a>
      <SiteNavbar page="mcp" />
      {/* The unmodified motion kit is loaded as a public stylesheet. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/mcp/taste/motion/motion.css" />
      <McpMotion />
      <main id="mcp-content">
        <section className={`hero hero--centred ${styles.hero}`} data-enter aria-labelledby="mcp-title">
          <div className={`wrap ${styles.wrap}`}>
            <div className={`hero-text ${styles.heroText}`}>
              <div className={`hero__c ${styles.heroCopy}`}>
                <p className={styles.eyebrow}><span className={styles.statusDot} aria-hidden="true" />Inspora MCP · Team trial</p>
                <h1 id="mcp-title" data-enter-whole>Design references<br />for your agent.</h1>
                <p className={`hero__lead ${styles.heroLead}`}>Search Inspora from Claude Code or Codex. Start with an idea or a work link; get six references with creator credits.</p>
                <div className={`btn-row ${styles.actions}`}>
                  <a href="#setup" className={`btn btn--primary ${styles.primary}`}>Set up Inspora <ArrowUpRight className="m-arrow" size={18} aria-hidden="true" /></a>
                  <a href="#workflow" className={`btn btn--secondary ${styles.secondary}`}>See the workflow <ArrowDown size={17} aria-hidden="true" /></a>
                </div>
              </div>
              <div className={`hero__window ${styles.heroWindow}`} data-enter-media data-mcp-ground>
                <div className={`ui app-frame ${styles.heroPreview}`}>
                  <div className={styles.promptBar}><span className={styles.promptSymbol} aria-hidden="true">↳</span><span>Find minimal geometric app icons</span><span className={styles.toolLabel}>Inspora · 6 references</span></div>
                  <div className={styles.heroResults}>
                    {examples[0].results.map(work => <a href={work.url} key={work.url} className={`card m-zoom ${styles.heroResult}`} aria-label={`View ${work.title} by ${work.creator}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={work.image} srcSet={`${work.thumbnail} 200w, ${work.image} ${work.width}w`} sizes="(max-width:639px) calc((100vw - 104px)/3), (max-width:1023px) calc((100vw - 184px)/3), calc((100vw - 328px)/6)" alt={work.alt} width={work.width} height={work.height} fetchPriority="high" />
                    </a>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="workflow" className={styles.section} aria-labelledby="workflow-title">
          <div className={`wrap ${styles.wrap}`}>
            <div className={styles.sectionHead}>
              <h2 id="workflow-title">Your reference<br /> shortlist.</h2>
              <p>Describe a direction. Open the references that fit, then narrow by kind, industry, style or color. Ask for details or another set when you need it.</p>
            </div>
            <McpWalkthrough />
          </div>
        </section>
        <section id="setup" className={`${styles.section} ${styles.setup}`} aria-labelledby="setup-title">
          <div className={`wrap ${styles.wrap}`}>
            <div className={styles.sectionHead}>
              <h2 id="setup-title">Connect to<br /> Inspora.</h2>
              <p>Add the hosted connection to Claude Code or Codex, then sign in to Inspora. This trial is for approved team accounts.</p>
            </div>
            <div className={styles.setupGrid}>
              <div className={styles.preparation}>
                <ol>
                  <li><div className={styles.stepTitle}><span>01</span><h3>Add Inspora</h3></div><p>Copy the server URL into your client’s MCP settings, or use its terminal commands.</p></li>
                  <li><div className={styles.stepTitle}><span>02</span><h3>Sign in</h3></div><p>Use your approved Inspora team account and choose Allow connection.</p></li>
                  <li><div className={styles.stepTitle}><span>03</span><h3>Start searching</h3></div><p>Describe an idea or share an Inspora work link. Content updates arrive automatically.</p></li>
                </ol>
                <a className={`link ${styles.guideLink}`} href="https://github.com/Aymen-Ben-Salem/inspora/blob/preview/archive-updates/tools/inspora-mcp/README.md" target="_blank" rel="noreferrer">Read the setup guide <ArrowUpRight size={17} aria-hidden="true" /></a>
                <p className={styles.setupNote}>Read-only catalog access. Your AI client’s normal provider usage still applies.</p>
              </div>
              <McpClientSetup />
            </div>
          </div>
        </section>
      </main>
      <footer className={`closing ${styles.closing}`} data-moment="letters-assemble" data-moment-opts='{"spread":0.4}' aria-labelledby="next-title">
        <div className={`wrap ${styles.wrap}`}>
          <div className={styles.future}>
            <h2 id="next-title" className="mo-la__type">Reference images<br />come next.</h2>
            <div className={styles.futureInfo}>
              <span className={styles.phase}>Planned · Phase 2</span>
              <p>Bring an uploaded image into your search. Image privacy, storage and matching quality will be reviewed before uploads are enabled.</p>
              <p className={styles.futureLimit}>Today, start with a written idea or an existing Inspora link.</p>
            </div>
          </div>
          <div className={styles.footerBase}>
            <div className={styles.footerRow}><Link className={styles.footerBrand} href="/">Inspora</Link><a href="#setup" className={`btn btn--primary ${styles.primary}`}>Set up Inspora <ArrowUpRight className="m-arrow" size={18} aria-hidden="true" /></a></div>
            <div className={styles.legal}><span>Inspora MCP · Preview for team review</span><span>Product names and logos are trademarks of their owners.</span><Link className="link" href="/privacy">Privacy</Link></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
