"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "@/app/mcp/mcp.module.css";

export function McpClientSetup() {
  const [client, setClient] = useState<"claude" | "codex">("claude");
  const [status, setStatus] = useState("");
  const endpoint = "https://mcp.inspora.design/mcp";
  const commands = client === "claude" ? `claude mcp add --transport http --scope user inspora ${endpoint}\nclaude mcp login inspora` : `codex mcp add inspora --url ${endpoint}\ncodex mcp login inspora`;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setStatus(label + " copied."); }
    catch { setStatus("Copy is unavailable. Select the text to copy it."); }
  }
  return (
    <div className={`ui app-frame ${styles.clientSetup}`}>
      <fieldset className={styles.clientChoices}><legend className="sr-only">Choose your AI client</legend>
        {([["claude", "Claude Code"], ["codex", "Codex"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={client === value} onClick={() => { setClient(value); setStatus(""); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value === "claude" ? "/mcp/icons/claude-code.svg" : "/mcp/icons/openai.svg"} alt="" width={24} height={24} data-openai={value === "codex" ? "" : undefined} loading="lazy" />
            {label}
          </button>
        ))}
      </fieldset>
      <div className={styles.configBox}>
        <div className={styles.configToolbar}><label htmlFor="mcp-server-url">Server URL</label><button type="button" onClick={() => copy(endpoint, "URL")}>{status === "URL copied." ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{status === "URL copied." ? "Copied URL" : "Copy URL"}</button></div>
        <input id="mcp-server-url" className={styles.pathInput} value={endpoint} readOnly spellCheck={false} aria-describedby="mcp-config-help" />
      </div>
      <p id="mcp-config-help" className={styles.configHelp}>Add this URL in your client’s MCP settings, then sign in to Inspora and allow the connection.</p>
      <details className={styles.configBox}><summary className={styles.configToolbar}>Use terminal commands</summary><div className={styles.configToolbar}><span>{client === "claude" ? "Claude Code" : "Codex"}</span><button type="button" onClick={() => copy(commands, "Commands")}><Copy size={15} aria-hidden="true" />Copy commands</button></div><pre tabIndex={0} aria-label="Connection commands"><code>{commands}</code></pre></details>
      <p className={styles.configHelp}>Team trial. Customer access will be part of Inspora Pro. Your client’s normal model usage applies.</p>
      <p role="status" className={styles.copyStatus}>{status}</p>
    </div>
  );
}
