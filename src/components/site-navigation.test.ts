import { describe, expect, it } from "vitest";

import { SITE_NAV_ITEMS, SITE_PRIMARY_ACTION } from "./site-navigation";

describe("site navigation", () => {
  it("keeps the design archive canonical at the root route", () => {
    expect(SITE_NAV_ITEMS).toEqual([
      { kind: "link", label: "Design", href: "/" },
      { kind: "link", label: "Websites", href: "/websites" },
      { kind: "link", label: "Logos", href: "/logos" },
      { kind: "link", label: "Saved", href: "/saved" },
      { kind: "action", label: "Contact", action: "contact" },
      { kind: "link", label: "Info", href: "/info" },
    ]);
  });

  it("uses the navbar plus for the shared submission flow", () => {
    expect(SITE_PRIMARY_ACTION).toEqual({
      kind: "action",
      label: "Submit work",
      action: "submit",
    });
    expect(SITE_NAV_ITEMS.some((item) => (item.label as string) === "Subscribe")).toBe(false);
  });
});

