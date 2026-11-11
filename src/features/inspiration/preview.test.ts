import { expect, it } from "vitest";
import { isMcpPreviewEnabled } from "./preview";
it("restricts MCP discovery to Preview even if production has a misleading data flag", () => {
  expect(isMcpPreviewEnabled({ VERCEL_ENV: "production", DATA_ENVIRONMENT: "preview" })).toBe(false);
  expect(isMcpPreviewEnabled({ DATA_ENVIRONMENT: "production" })).toBe(false);
  expect(isMcpPreviewEnabled({})).toBe(false);
  expect(isMcpPreviewEnabled({ VERCEL_ENV: "preview" })).toBe(true);
  expect(isMcpPreviewEnabled({ DATA_ENVIRONMENT: "preview" })).toBe(true);
});
