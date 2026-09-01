import { describe, expect, it } from "vitest";

import { isLogoKind, isLogoStatus, LOGO_KINDS } from "./logo";

describe("logo domain", () => {
  it("distinguishes logos from icons", () => {
    expect(LOGO_KINDS).toEqual(["logo", "icon"]);
    expect(isLogoKind("logo")).toBe(true);
    expect(isLogoKind("icon")).toBe(true);
    expect(isLogoKind("wordmark")).toBe(false);
  });

  it("accepts only supported lifecycle states", () => {
    expect(isLogoStatus("draft")).toBe(true);
    expect(isLogoStatus("published")).toBe(true);
    expect(isLogoStatus("archived")).toBe(true);
    expect(isLogoStatus("deleted")).toBe(false);
  });
});
