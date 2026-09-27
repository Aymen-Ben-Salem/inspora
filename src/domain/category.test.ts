import { describe, expect, it } from "vitest";
import { isCategoryName, normalizeCategoryName } from "./category";

describe("category names", () => {
  it("supports new and international names", () => {
    for (const name of ["Typography", "Art & Design", "?dition", "3D", "????"]) expect(isCategoryName(name)).toBe(true);
    expect(normalizeCategoryName("  Type   Design  ")).toBe("Type Design");
  });
  it.each(["", " ", " trailing ", "double  space", "a".repeat(61), "All", "LOGOS", "Websites", "app-icons", "in-review", "bad\u0000name"])("rejects invalid name %j", (name) => {
    expect(isCategoryName(name)).toBe(false);
  });
});
