import { describe, expect, it } from "vitest";
import { buildMcpClientConfig } from "./client-config";

describe("MCP setup configuration", () => {
  it("uses the entered Windows path with spaces in valid Claude JSON", () => {
    const config = JSON.parse(buildMcpClientConfig("claude", " C:\\Design work\\inspora\\ ")!);
    expect(config.mcpServers.inspora.args).toEqual(["C:/Design work/inspora/tools/inspora-mcp/server.mjs"]);
  });
  it("escapes quoted POSIX paths in the Codex TOML string", () => {
    const config = buildMcpClientConfig("codex", '/home/me/a "quoted" repo');
    const args = config!.split("\n").find(line => line.startsWith("args = "))!.slice(7);
    expect(JSON.parse(args)).toEqual(['/home/me/a "quoted" repo/tools/inspora-mcp/server.mjs']);
    expect(config).toContain("startup_timeout_sec = 30");
  });
  it.each(["", "relative/repo", "C:relative", "C:/bad\npath", "//server/share"])("rejects an unusable path: %j", path => {
    expect(buildMcpClientConfig("claude", path)).toBeNull();
    expect(buildMcpClientConfig("codex", path)).toBeNull();
  });
});
