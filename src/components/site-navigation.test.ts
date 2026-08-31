import { describe, expect, it } from "vitest";

import { SITE_NAV_ITEMS } from "./site-navigation";

describe("site navigation", () => {
  it("keeps the design archive canonical at the root route", () => {
    expect(SITE_NAV_ITEMS).toEqual([
      { kind: "link", label: "design", href: "/" },
      { kind: "link", label: "websites", href: "/websites" },
      { kind: "link", label: "logos", href: "/logos" },
      { kind: "action", label: "contact", action: "contact" },
      { kind: "link", label: "info", href: "/info" },
    ]);
  });
});

