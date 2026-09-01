import { describe, expect, it } from "vitest";

import { SITE_NAV_ITEMS } from "./site-navigation";

describe("site navigation", () => {
  it("keeps the design archive canonical at the root route", () => {
    expect(SITE_NAV_ITEMS).toEqual([
      { kind: "link", label: "Design", href: "/" },
      { kind: "link", label: "Websites", href: "/websites" },
      { kind: "link", label: "Logos", href: "/logos" },
      { kind: "action", label: "Contact", action: "contact" },
      { kind: "link", label: "Info", href: "/info" },
    ]);
  });
});

