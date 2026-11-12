"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buildMcpClientConfig } from "@/features/inspiration/client-config";
import styles from "@/app/mcp/mcp.module.css";

export function McpClientSetup() {
  const [client, setClient] = useState<"claude" | "codex">("claude");
  const [checkoutPath, setCheckoutPath] = useState("C:/path/to/inspora");
  const [status, setStatus] = useState("");
  const config = buildMcpClientConfig(client, checkoutPath);
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
      <label className={styles.pathLabel} htmlFor="mcp-checkout">Your checkout path</label>
      <input id="mcp-checkout" className={styles.pathInput} value={checkoutPath} onChange={event => {setCheckoutPath(event.target.value); setStatus("");}} spellCheck={false} autoComplete="off" aria-invalid={!config} aria-describedby={!config ? "mcp-path-error" : "mcp-config-help"} />
      {!config && <p id="mcp-path-error" className={styles.configHelp}>Enter an absolute checkout path, such as C:/work/inspora or /home/me/inspora.</p>}
      <div className={styles.configBox}>
        <div className={styles.configToolbar}><span>{client === "claude" ? "inspora-mcp.json" : "config.toml"}</span><button type="button" disabled={!config} onClick={async () => {
          if (!config) return;
          try { await navigator.clipboard.writeText(config); setStatus("Configuration copied."); }
          catch { setStatus("Copy is unavailable. Select the configuration text to copy it."); }
        }}>{status === "Configuration copied." ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{status === "Configuration copied." ? "Copied config" : "Copy config"}</button></div>
        <pre tabIndex={0} aria-label={client === "claude" ? "Claude Code configuration" : "Codex configuration"}><code>{config ?? "Enter your checkout path to generate the configuration."}</code></pre>
      </div>
      <p id="mcp-config-help" className={styles.configHelp}>{client === "claude" ? <>Save this JSON file and start Claude Code with <code>--mcp-config</code> followed by its path. Team validation in Claude Code is still pending.</> : <>Add this entry to your existing <code>config.toml</code>, keeping your other servers and settings.</>}</p>
      <p role="status" className={styles.copyStatus}>{status}</p>
    </div>
  );
}
