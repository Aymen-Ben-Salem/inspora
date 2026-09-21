import { describe, expect, it } from "vitest";

import { canonicalizeSubmissionReviewForm } from "./submission-review-form";

describe("submission review form authority", () => {
  it("replaces browser creator, status and App Icon kind with stored values", () => {
    const browser = new FormData();
    browser.set("creatorId", "00000000-0000-4000-8000-000000000099");
    browser.set("creatorName", "Spoofed creator");
    browser.set("creatorAvatarUrl", "https://img.clerk.com/private-looking-avatar");
    browser.set("status", "draft");
    browser.set("kind", "logo");
    browser.set("title", "Prepared icon");

    const canonical = canonicalizeSubmissionReviewForm(browser, {
      kind: "app-icon",
      creatorId: "00000000-0000-4000-8000-000000000010",
      creatorName: "Stored creator",
    });

    expect(Object.fromEntries(canonical.entries())).toEqual(
      expect.objectContaining({
        creatorId: "00000000-0000-4000-8000-000000000010",
        creatorName: "Stored creator",
        creatorAvatarUrl: "/brand/default-avatar.svg",
        status: "published",
        kind: "icon",
        title: "Prepared icon",
      }),
    );
  });
});
