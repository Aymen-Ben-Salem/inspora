import { afterEach, expect, it, vi } from "vitest";
const callbacks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => callbacks.push(callback) }));
import { notifyCatalogChanged, syncNotificationConfig } from "./notify";
const values = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATA_ENVIRONMENT: "production", INSPORA_MCP_SYNC_URL: "https://inspora-mcp-pilot.aymenbensalem-3lsi.workers.dev/internal/catalog", INSPORA_MCP_SYNC_TOKEN: "x".repeat(43) };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); callbacks.length = 0; });
it("only notifies the configured production MCP, never Preview or arbitrary URLs", () => {
  expect(syncNotificationConfig(values)).toEqual({ url: values.INSPORA_MCP_SYNC_URL, token: values.INSPORA_MCP_SYNC_TOKEN });
  for (const change of [{ VERCEL_ENV: "preview" }, { VERCEL_GIT_COMMIT_REF: "preview/archive-updates" }, { DATA_ENVIRONMENT: "preview" }, { INSPORA_MCP_SYNC_TOKEN: "short" }, { INSPORA_MCP_SYNC_URL: "https://evil.test/internal/catalog" }, { INSPORA_MCP_SYNC_URL: values.INSPORA_MCP_SYNC_URL + "?secret=test" }]) expect(syncNotificationConfig({ ...values, ...change })).toBeNull();
});
it("runs after the response and sends no content or account data", async () => {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const request = vi.fn(async () => new Response(null, { status: 202 })); vi.stubGlobal("fetch", request);
  notifyCatalogChanged(); expect(request).not.toHaveBeenCalled(); expect(callbacks).toHaveLength(1);
  await callbacks[0](); expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]).toEqual([values.INSPORA_MCP_SYNC_URL, expect.objectContaining({ method: "POST", body: "{}", redirect: "error" })]);
});
it("retry exhaustion stays out of the save response and logs no credentials", async () => {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  const request = vi.fn(async () => { throw Error("private network detail"); }); vi.stubGlobal("fetch", request);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  notifyCatalogChanged(); await callbacks[0](); expect(request).toHaveBeenCalledTimes(3);
  expect(warning).toHaveBeenCalledWith("MCP catalog notification failed; shared repair will retry.");
});
