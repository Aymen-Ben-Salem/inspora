import { describe, expect, it, vi } from "vitest";

import {
  firstStepForKind,
  hasSubmissionIntent,
  navigateToSubmission,
  previousSubmissionStep,
  removeSubmissionIntent,
  submissionAuthHref,
  submissionReceiptDestination,
  submissionStepPresentation,
} from "./submission-state";

describe("submission flow state", () => {
  it.each([
    ["design", "method"],
    ["logo", "method"],
    ["website", "link"],
    ["app-icon", "link"],
  ] as const)("opens the right step for %s", (kind, page) => {
    expect(firstStepForKind(kind)).toEqual({ page, kind });
  });

  it.each([
    [{ page: "type" }, { title: "Submit", description: "Choose what you want to submit." }],
    [{ page: "method", kind: "design" }, { title: "Design", description: "Choose the upload method." }],
    [{ page: "link", kind: "design" }, { title: "Design", description: "Use an X post URL." }],
    [{ page: "upload", kind: "design" }, { title: "Design", description: "Upload your design." }],
    [{ page: "method", kind: "logo" }, { title: "Logo", description: "Choose the upload method." }],
    [{ page: "link", kind: "logo" }, { title: "Logo", description: "Use an X post URL." }],
    [{ page: "upload", kind: "logo" }, { title: "Logo", description: "Upload your logo." }],
    [{ page: "link", kind: "website" }, { title: "Website", description: "Use a live website URL." }],
    [{ page: "link", kind: "app-icon" }, { title: "App Icon", description: "Use an App Store listing." }],
  ] as const)("uses the approved Figma presentation for %j", (step, expected) => {
    expect(submissionStepPresentation(step)).toEqual(expected);
  });

  it.each([
    [{ page: "method", kind: "design" }, { page: "type" }],
    [{ page: "link", kind: "design" }, { page: "method", kind: "design" }],
    [{ page: "upload", kind: "logo" }, { page: "method", kind: "logo" }],
    [{ page: "link", kind: "website" }, { page: "type" }],
  ] as const)("returns without erasing the draft", (step, expected) => {
    expect(previousSubmissionStep(step)).toEqual(expected);
  });

  it("carries only the local one-shot submission intent through sign-in", () => {
    expect(submissionAuthHref()).toBe(
      "/sign-in?redirect_url=%2Fprofile%3Fsubmit%3D1",
    );
  });

  it("opens only the explicit profile submission return and consumes it once", () => {
    expect(hasSubmissionIntent("/profile?submit=1")).toBe(true);
    expect(hasSubmissionIntent("/profile?submit=0")).toBe(false);
    expect(hasSubmissionIntent("/?submit=1")).toBe(false);
    expect(removeSubmissionIntent("/profile?submit=1&filter=all")).toBe(
      "/profile?filter=all",
    );
    expect(hasSubmissionIntent(removeSubmissionIntent("/profile?submit=1"))).toBe(false);
  });

  it.each([
    ["in_review", "/profile?filter=in-review&submission=sub-1"],
    ["accepted", "/posts/published"],
    ["rejected", "/profile?submission=sub-1"],
  ] as const)("uses the server receipt for a delayed %s retry", (status, ownerHref) => {
    expect(
      submissionReceiptDestination({ id: "sub-1", status, ownerHref }),
    ).toBe(ownerHref);
  });

  it("lets the destination navigation load fresh data without racing a refresh", () => {
    const router = { push: vi.fn(), refresh: vi.fn() };

    navigateToSubmission(router, "/profile?filter=in-review&submission=sub-1");

    expect(router.push).toHaveBeenCalledWith(
      "/profile?filter=in-review&submission=sub-1",
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
