import type { Metadata } from "next";
import { McpConsentCard } from "@/components/inspiration/mcp-consent-card";
import styles from "@/app/connect/mcp/page.module.css";
export const metadata: Metadata = { title: "Connection design preview", robots: { index: false, follow: false } };
export default function ConsentPreviewPage() {
  return <main className={styles.page}><header className={styles.brand}>Inspora</header>
    <McpConsentCard details={{ clientName: "Codex", clientDomain: "chatgpt.com", redirectHost: "127.0.0.1", redirectIsLoopback: true, scope: ["inspiration:read", "offline_access"] }}>
      <div className={styles.actions}><button type="button" aria-disabled="true">Cancel</button><button type="button" value="approve" aria-disabled="true">Allow connection</button></div>
    </McpConsentCard><p className={styles.previewNotice}>Design preview. These buttons do not create a connection.</p></main>;
}
