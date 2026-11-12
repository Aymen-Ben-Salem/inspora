export function buildMcpClientConfig(client: "claude" | "codex", checkoutPath: string): string | null {
  const path = checkoutPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || /[\u0000-\u001f\u007f]/.test(path) || !/^(?:[A-Za-z]:\/|\/[^/])/.test(path)) return null;
  const server = `${path}/tools/inspora-mcp/server.mjs`;
  if (client === "claude") return JSON.stringify({mcpServers: {inspora: {command: "node", args: [server]}}}, null, 2);
  return `[mcp_servers.inspora]\ncommand = "node"\nargs = [${JSON.stringify(server)}]\nstartup_timeout_sec = 30\ntool_timeout_sec = 30`;
}
