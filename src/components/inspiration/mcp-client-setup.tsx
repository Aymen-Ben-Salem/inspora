"use client";

import { useState } from "react";

export function McpClientSetup() {
  const [client, setClient] = useState<"claude" | "codex">("claude");
  const [status, setStatus] = useState("");
  const config = client === "claude"
    ? '{\n  "mcpServers": {\n    "inspora": {\n      "command": "node",\n      "args": ["C:/path/to/inspora/tools/inspora-mcp/server.mjs"]\n    }\n  }\n}'
    : '[mcp_servers.inspora]\ncommand = "node"\nargs = ["C:/path/to/inspora/tools/inspora-mcp/server.mjs"]\nstartup_timeout_sec = 30\ntool_timeout_sec = 30';
  return (
    <div>
      <fieldset className="flex gap-2"><legend className="sr-only">Choose your AI client</legend>
        {([ ["claude", "Claude Code"], ["codex", "Codex"] ] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={client === value} onClick={() => { setClient(value); setStatus(""); }} className={`focus-ring rounded-md border px-4 py-2.5 text-sm transition-colors ${client === value ? "border-[#262626] bg-[#262626] text-white" : "border-[#e6e6e6] bg-white text-[#767676] hover:text-[#262626]"}`}>{label}</button>
        ))}
      </fieldset>
      <div className="mt-6">
        <p className="max-w-[660px] text-[16px] leading-7 text-[#767676]">{client === "claude" ? "Save this as a separate JSON file, then start Claude Code with --mcp-config followed by that file’s path." : "Add this entry to your existing Codex config.toml. Keep your other servers and settings."} Replace the example checkout path with yours.</p>
        <div className="mt-5 overflow-hidden rounded-md border border-[#e6e6e6] bg-[#fafafa]">
          <div className="flex items-center justify-between border-b border-[#e6e6e6] px-4 py-3 text-sm"><span>{client === "claude" ? "inspora-mcp.json" : "config.toml"}</span><button type="button" className="focus-ring rounded px-2 py-1 text-[#767676] hover:text-[#262626]" onClick={async () => { try { await navigator.clipboard.writeText(config); setStatus("Configuration copied."); } catch { setStatus("Copy is unavailable here. Select the configuration text above to copy it."); } }}>{status === "Configuration copied." ? "Copied" : "Copy config"}</button></div>
          <pre className="overflow-x-auto p-5 text-[13px] leading-6"><code>{config}</code></pre>
        </div>
        <p role="status" className="mt-3 min-h-5 text-sm text-[#767676]">{status}</p>
      </div>
    </div>
  );
}
