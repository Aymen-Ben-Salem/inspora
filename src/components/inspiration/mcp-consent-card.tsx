import type { ReactNode } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import styles from "@/app/connect/mcp/page.module.css";

export type McpClientDetails = { clientName?: string; clientDomain?: string; redirectHost?: string; redirectIsLoopback?: boolean; scope?: string[] };

export function McpConsentCard({ details, children }: { details: McpClientDetails; children: ReactNode }) {
  const name = (details.clientName || "Your app").slice(0, 120);
  const clientName = name.trim().toLowerCase();
  const clientLogo = /^(?:openai[ -])?codex(?:[ -](?:cli|mcp client))?$/.test(clientName)
    ? "/mcp/icons/codex.svg"
    : /^(?:claude|claude[ -]code)$/.test(clientName) ? "/mcp/icons/claude-code.svg" : undefined;
  return <section className={styles.card} aria-labelledby="connection-title">
    <div className={styles.connection} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/inspora-auth-mark.svg" alt="" width={56} height={56} />
      <ArrowRight size={20} strokeWidth={1.5} /><span className={styles.clientMark}>
        {clientLogo ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={clientLogo} alt="" width={36} height={36} /> : name.slice(0, 1).toUpperCase()}
      </span>
    </div>
    <h1 id="connection-title">Connect to {name}</h1>
    <p className={styles.subtitle}>Find Inspora references from your AI app.</p>
    <div className={styles.permissions}>
      <div><Check size={18} aria-hidden="true" /><p><strong>Browse public inspiration</strong><span>Search designs and view their details and previews.</span></p></div>
      <div><LockKeyhole size={18} aria-hidden="true" /><p><strong>Your private data stays private</strong><span>No access to saved collections, account details or payments. No editing.</span></p></div>
    </div>
    {details.redirectIsLoopback ? <p className={styles.localNotice}>Connect only if you started this request in an app on your computer.</p> : null}
    <details className={styles.details}><summary>Connection details</summary><dl>
      <div><dt>App</dt><dd>{name}</dd></div>
      {details.clientDomain ? <div><dt>Domain</dt><dd>{details.clientDomain.slice(0, 200)}</dd></div> : null}
      {details.redirectHost ? <div><dt>Returns to</dt><dd>{details.redirectIsLoopback ? "Your computer (" + details.redirectHost.slice(0, 200) + ")" : details.redirectHost.slice(0, 200)}</dd></div> : null}
      {details.scope?.includes("offline_access") ? <div><dt>Duration</dt><dd>Up to 30 days, or until revoked</dd></div> : null}
    </dl></details>
    {!details.clientDomain ? <p className={styles.localNotice}>This app provided its own name. Inspora has not verified its identity.</p> : null}
    {children}
  </section>;
}
