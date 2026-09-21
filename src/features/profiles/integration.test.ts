import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    createElement("img", { ...props, alt: String(props.alt ?? "") }),
}));
vi.mock("@/components/creator-avatar", () => ({
  CreatorAvatar: () => createElement("div", { "data-testid": "creator-avatar" }),
}));

import { ProfileHeader } from "../../components/profile/profile-header";

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Task Seven Creator",
  username: "task_seven_creator",
  avatarUrl: "https://images.example/avatar.png",
  websiteUrl: null,
  xProfileUrl: null,
};

describe("profile views integration", () => {
  it("shows a real aggregate without exposing provider records", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileHeader, {
        profile,
        owner: false,
        works: 4,
        views: {
          status: "available",
          count: 3,
          asOf: "2026-09-21T12:05:00.000Z",
        },
      }),
    );

    expect(html).toContain("3</dd><dt");
    expect(html).toContain("3 published-work views");
    expect(html).not.toContain("sessionId");
    expect(html).not.toContain("POSTHOG");
  });

  it("renders an accessible unavailable state instead of zero", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileHeader, {
        profile,
        owner: false,
        works: 4,
        views: { status: "unavailable" },
      }),
    );

    expect(html).toContain('aria-label="Views unavailable"');
    expect(html).toContain("—");
    expect(html).not.toContain(">0</dd>");
  });
});

it.each([false, true])("uses the same aggregate for owner=%s", (owner) => {
  const html = renderToStaticMarkup(createElement(ProfileHeader, {
    profile, owner, works: 4, views: {status:"available",count:1234,asOf:"2026-09-21T12:05:00.000Z"},
  }));
  expect(html).toContain("1,234</dd>");
  expect(html).toContain("1234 published-work views");
});
