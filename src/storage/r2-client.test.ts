import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { r2Endpoint } from "./r2-client";

describe("R2 client endpoint", () => {
  const accountId = "0123456789abcdef0123456789abcdef";
  const hostname = `${accountId}.r2.cloudflarestorage.com`;

  it.each([accountId, hostname, `https://${hostname}`])(
    "normalizes a Cloudflare account value from %s",
    (value) => {
      expect(r2Endpoint(value)).toBe(`https://${hostname}`);
    },
  );

  it.each([
    "not-an-account",
    `http://${hostname}`,
    `https://${hostname}/path`,
    "https://example.com",
  ])("rejects an invalid Cloudflare account value from %s", (value) => {
    expect(() => r2Endpoint(value)).toThrow("R2 account endpoint is invalid.");
  });
});
