import { describe, expect, it } from "vitest";

import {
  isPrivateAnalyticsPath,
  sanitizeAnalyticsPageUrl,
  sanitizeAnalyticsReferrer,
} from "./privacy";

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

describe("analytics URL sanitization", () => {
  const baseUrl = "https://inspora.example";

  it("keeps the page origin and path without parameters or fragments", () => {
    expect(
      sanitizeAnalyticsPageUrl(
        "https://inspora.example/posts/example?token=secret#details",
        baseUrl,
      ),
    ).toBe("https://inspora.example/posts/example");
    expect(sanitizeAnalyticsPageUrl("/logos?category=type", baseUrl)).toBe(
      "https://inspora.example/logos",
    );
  });

  it("reduces referrers to their origin", () => {
    expect(
      sanitizeAnalyticsReferrer(
        "https://search.example/results?q=private",
        baseUrl,
      ),
    ).toBe("https://search.example");
  });

  it("drops empty, non-web, and invalid URLs", () => {
    expect(sanitizeAnalyticsPageUrl("", baseUrl)).toBeUndefined();
    expect(
      sanitizeAnalyticsPageUrl("mailto:hello@example.com", baseUrl),
    ).toBeUndefined();
    expect(sanitizeAnalyticsPageUrl("/relative", "not a URL")).toBeUndefined();
  });
});
