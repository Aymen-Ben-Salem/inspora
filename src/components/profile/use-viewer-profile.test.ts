import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ViewerProfileContext, useViewerProfile } from "./use-viewer-profile";

const profile = {
  id: "creator-a", name: "Saved viewer", username: "viewer_a",
  avatarUrl: "https://example.com/saved.jpg", websiteUrl: null, xProfileUrl: null,
};

function Consumer({ userId }: { userId?: string }) {
  const viewer = useViewerProfile(userId);
  return createElement("span", null, viewer.isLoading ? "loading" : viewer.profile?.avatarUrl ?? "none");
}

describe("viewer profile consumers", () => {
  it("immediately reuses the shared saved photo when a new navbar mounts", () => {
    for (const page of ["designs", "websites", "designs"]) {
      const html = renderToStaticMarkup(createElement(ViewerProfileContext.Provider, {
        value: { userId: "viewer-a", profile, isLoading: false },
      }, createElement(Consumer, { key: page, userId: "viewer-a" })));
      expect(html).toContain(profile.avatarUrl);
      expect(html).not.toContain("loading");
    }
  });

  it.each(["viewer-b", undefined])("hides the old viewer's photo for %s", (userId) => {
    const html = renderToStaticMarkup(createElement(ViewerProfileContext.Provider, {
      value: { userId: "viewer-a", profile, isLoading: false },
    }, createElement(Consumer, { userId })));
    expect(html).not.toContain(profile.avatarUrl);
    expect(html).toContain(userId ? "loading" : "none");
  });
});
