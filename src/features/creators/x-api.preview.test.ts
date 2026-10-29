import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { lookupXProfile } from "./x-api";

it.skipIf(process.env.RUN_CREATOR_CLAIM_INTEGRATION !== "1" || process.env.DATA_ENVIRONMENT !== "preview")("authenticates one public profile lookup against the official X API", async () => {
  const result = await lookupXProfile("https://x.com/xdevelopers");
  expect(result.username).toBe("xdevelopers");
  expect(result.id).toMatch(/^[1-9]\d+$/);
}, 15000);
