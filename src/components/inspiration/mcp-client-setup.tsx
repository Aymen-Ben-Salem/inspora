"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Check, Copy } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import styles from "@/app/mcp/mcp.module.css";

gsap.registerPlugin(useGSAP);

type Client = "claude" | "codex";
const MARKETPLACE = "https://github.com/inspora-design/inspora-plugin.git";
const setup: Record<Client, { label: string; icon: string; install: string; prompt: string; signIn: ReactNode }> = {
  claude: {
    label: "Claude Code",
    icon: "/mcp/icons/claude-code.svg",
    install: `claude plugin marketplace add ${MARKETPLACE}\nclaude plugin install inspora@inspora-team`,
    prompt: `Install the Inspora plugin by running:\n\nclaude plugin marketplace add ${MARKETPLACE}\nclaude plugin install inspora@inspora-team\n\nThen tell me how to sign in: run /reload-plugins, open /mcp, select plugin:inspora:inspora and choose Authenticate.`,
    signIn: <>Run <code>/reload-plugins</code>, then <code>/mcp</code>, select <code>plugin:inspora:inspora</code> and choose Authenticate.</>,
  },
  codex: {
    label: "Codex",
    icon: "/mcp/icons/codex.svg",
    install: `codex plugin marketplace add ${MARKETPLACE}\ncodex plugin add inspora@inspora-team`,
    prompt: `Install the Inspora plugin by running:\n\ncodex plugin marketplace add ${MARKETPLACE}\ncodex plugin add inspora@inspora-team\n\nThen tell me how to sign in: run codex mcp login inspora and start a new session.`,
    signIn: <>Run <code>codex mcp login inspora</code>, then start a new session.</>,
  },
};

/** Plugin installation for Claude Code and Codex. */
export function McpClientSetup() {
  const scope = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [client, setClient] = useState<Client>("claude");
  const [status, setStatus] = useState("");
  const current = setup[client];

  useGSAP(() => {
    if (!mounted.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { mounted.current = true; return; }
    gsap.fromTo("[data-step]", { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.45, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity,visibility" });
  }, { scope, dependencies: [client] });

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setStatus(`${label} copied.`); }
    catch { setStatus("Copy isn’t available here. Select the text to copy it."); }
  }
  function choose(next: Client) { setClient(next); setStatus(""); }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Client = client === "claude" ? "codex" : "claude";
    choose(next);
    scope.current?.querySelector<HTMLButtonElement>(`#client-tab-${next}`)?.focus();
  }
  const copied = (label: string) => status === `${label} copied.`;

  return (
    <div ref={scope} className={styles.client}>
      <div className={styles.clientTabs} role="tablist" aria-label="Choose your app" onKeyDown={onKey}>
        {(Object.keys(setup) as Client[]).map(value => (
          <button key={value} id={`client-tab-${value}`} type="button" role="tab" aria-selected={client === value} aria-controls="client-panel"
            tabIndex={client === value ? 0 : -1} onClick={() => choose(value)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup[value].icon} alt="" width={20} height={20} loading="lazy" />
            {setup[value].label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="client-panel" aria-labelledby={`client-tab-${client}`}>
        <ol className={styles.steps}>
          <li data-step>
            <div>
              <h3>Install the plugin</h3>
              <div className={styles.command}>
                <div className={styles.commandBar}>
                  <span>Terminal</span>
                  <button type="button" onClick={() => copy(current.install, "Commands")}>
                    {copied("Commands") ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied("Commands") ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre tabIndex={0} aria-label="Install commands"><code>{current.install}</code></pre>
              </div>
              <button type="button" className={styles.promptButton} onClick={() => copy(current.prompt, "Prompt")}>
                {copied("Prompt") ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied("Prompt") ? "Prompt copied. Paste it into " + current.label + "." : "Or copy a prompt and let " + current.label + " install it"}
              </button>
            </div>
          </li>
          <li data-step><div><h3>Sign in to Inspora</h3><p>{current.signIn}</p></div></li>
          <li data-step><div><h3>Ask for references</h3><p>Try “Find onboarding references for a fintech app.”</p></div></li>
        </ol>
        <p className={status.endsWith("copied.") ? styles.srOnly : styles.copyStatus} role="status">{status}</p>
      </div>
    </div>
  );
}
