import { describe, expect, it } from "vitest";

import { publicAuthRedirect } from "./public-auth-redirect";

describe("publicAuthRedirect", () => {
  it("keeps internal saved destinations", () => {
    expect(publicAuthRedirect("/saved?category=Web")).toBe(
      "/saved?category=Web",
    );
  });

  it.each([
    "https://example.com/steal-session",
    "//example.com/steal-session",
    "/\\example.com/steal-session",
  ])("rejects unsafe destination %s", (destination) => {
    expect(publicAuthRedirect(destination)).toBe("/");
  });
});
