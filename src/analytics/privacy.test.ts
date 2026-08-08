import { describe, expect, it } from "vitest";

import { isPrivateAnalyticsPath } from "./privacy";

describe("analytics privacy paths", () => {
  it("excludes authentication and admin routes", () => {
    expect(isPrivateAnalyticsPath("/admin")).toBe(true);
    expect(isPrivateAnalyticsPath("/admin/analytics")).toBe(true);
    expect(isPrivateAnalyticsPath("/sign-in/callback")).toBe(true);
    expect(isPrivateAnalyticsPath("/admin-access-denied")).toBe(true);
  });

  it("does not exclude similarly named public routes", () => {
    expect(isPrivateAnalyticsPath("/administrator-design")).toBe(false);
    expect(isPrivateAnalyticsPath("/posts/example")).toBe(false);
  });
});
