"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "@/app/mcp/mcp.module.css";

const setupPrompt = "Set up Inspora for me.\n\n1. Connect https://mcp.inspora.design/mcp using Streamable HTTP and OAuth. Reuse an existing correct connection and sign me in if needed.\n2. Install inspora-discovery and inspora-design-direction from https://mcp.inspora.design with npx skills add, using -g -y and an explicit --agent for my current client (codex, claude-code, or its supported installer ID).\n3. Verify both installed skills are available to this agent, then call catalog_status through Inspora. Say \"Inspora is ready\" only when those checks succeed. If a check fails, explain the specific next step.";
const checkPrompt = "Confirm inspora-discovery and inspora-design-direction are available to you, then call Inspora's catalog_status. Say Inspora is ready only if all checks pass; otherwise tell me the specific next step.";

export function McpClientSetup() {
  const [client, setClient] = useState<"claude" | "codex">("claude");
  const [status, setStatus] = useState("");
  const endpoint = "https://mcp.inspora.design/mcp";
  const agent = client === "claude" ? "claude-code" : "codex";
  const connectCommand = client === "claude"
    ? "claude mcp add --transport http --scope user inspora " + endpoint
    : "codex mcp add inspora --url " + endpoint;
  const skillsCommand = "npx skills add https://mcp.inspora.design -g --agent " + agent + " -y";
  const verifyCommand = "npx skills list -g --agent " + agent;
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setStatus(label + " copied."); }
    catch { setStatus("Copy is unavailable. Select the text to copy it."); }
  }
  return (
    <div className={`ui app-frame ${styles.clientSetup}`}>
      <details className={styles.configBox}><summary className={styles.configToolbar}>Let your agent set it up</summary>
        <div className={styles.configToolbar}><span>Works with your current agent</span><button type="button" onClick={() => copy(setupPrompt, "Setup prompt")}><Copy size={15} aria-hidden="true" />Copy prompt</button></div>
        <pre tabIndex={0} aria-label="Agent setup prompt"><code>{setupPrompt}</code></pre>
      </details>
      <fieldset className={styles.clientChoices}><legend className="sr-only">Choose your AI client for manual setup</legend>
        {([["claude", "Claude Code"], ["codex", "Codex"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={client === value} onClick={() => { setClient(value); setStatus(""); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value === "claude" ? "/mcp/icons/claude-code.svg" : "/mcp/icons/openai.svg"} alt="" width={24} height={24} data-openai={value === "codex" ? "" : undefined} loading="lazy" />
            {label}
          </button>
        ))}
      </fieldset>
      <div className={styles.configBox}>
        <div className={styles.configToolbar}><label htmlFor="mcp-server-url">1. Connect Inspora</label><button type="button" onClick={() => copy(endpoint, "URL")}>{status === "URL copied." ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{status === "URL copied." ? "Copied URL" : "Copy URL"}</button></div>
        <input id="mcp-server-url" className={styles.pathInput} value={endpoint} readOnly spellCheck={false} aria-describedby="mcp-config-help" />
      </div>
      <p id="mcp-config-help" className={styles.configHelp}>Add this URL in your client’s MCP settings, then sign in to Inspora and allow the connection. If it is already connected, continue.</p>
      <details className={styles.configBox}><summary className={styles.configToolbar}>Connect through the terminal</summary>
        <div className={styles.configToolbar}><span>{client === "claude" ? "Claude Code" : "Codex"}</span><button type="button" onClick={() => copy(connectCommand, "Connection command")}><Copy size={15} aria-hidden="true" />Copy command</button></div>
        <pre tabIndex={0} aria-label="Connection command"><code>{connectCommand}</code></pre>
        <p className={styles.configHelp}>If sign-in is still needed, run <code>{client === "claude" ? "claude" : "codex"} mcp login inspora</code>, then choose Allow connection in your browser.</p>
      </details>
      <div className={styles.configBox}>
        <div className={styles.configToolbar}><span>2. Add the skills</span><button type="button" onClick={() => copy(skillsCommand, "Skills command")}><Copy size={15} aria-hidden="true" />Copy command</button></div>
        <pre tabIndex={0} aria-label="Skills installation command"><code>{skillsCommand}</code></pre>
      </div>
      <p className={styles.configHelp}>Run this once in your terminal with Node.js 22.20 or newer. It installs both skills for your selected agent, across projects.</p>
      <details className={styles.configBox}><summary className={styles.configToolbar}>3. Check you are ready</summary>
        <div className={styles.configToolbar}><span>Ask your agent to check</span><button type="button" onClick={() => copy(checkPrompt, "Check prompt")}><Copy size={15} aria-hidden="true" />Copy check</button></div>
        <p className={styles.configHelp}>{checkPrompt}</p>
        <p className={styles.configHelp}>Or run <code>{verifyCommand}</code> and look for inspora-discovery and inspora-design-direction. Confirm both skills are available in your agent and Inspora is connected in its MCP settings, then try a search.</p>
        <p className={styles.configHelp}>Start a fresh conversation if skills or tools are missing. Restart the agent or extension if needed.</p>
      </details>
      <p className={styles.configHelp}><a href="https://mcp.inspora.design/setup">Other agents, updates and setup help</a></p>
      <p className={styles.configHelp}>Team trial. Customer access will be part of Inspora Pro. Your client’s normal model usage applies.</p>
      <p role="status" className={styles.copyStatus}>{status}</p>
    </div>
  );
}
