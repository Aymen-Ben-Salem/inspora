// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("../feed-motion", () => ({
  FeedMotion: ({ children }: { children: React.ReactNode }) => children,
}));
import { PublicSponsorsProvider } from "./public-sponsors";
import { SponsorIcons } from "./sponsor-icons";
import { SponsorMarquee } from "./sponsor-marquee";
import { PostFeed } from "../post-feed";
import { WebsiteArchive } from "../websites/website-archive";
import { LogoArchive } from "../logos/logo-archive";
import { DetailSidebarLayout } from "../detail-sidebar-primitives";
import type { ActiveSponsor } from "@/domain/sponsor";
let container: HTMLDivElement, root: Root;
const fetchMock = vi.fn();
let active: ActiveSponsor[] = [];
const campaign = (id: string): ActiveSponsor => ({
  id,
  versionId: `${id}-v1`,
  title: id,
  url: `https://${id}.example.com`,
  iconUrl: `/icon-${id}.png`,
  wordmarkUrl: `/wordmark-${id}.png`,
  mediaType: "image",
  mediaWidth: 1200,
  mediaHeight: 800,
  mediaAlt: id,
  paidThrough: new Date(Date.now() + 3600000).toISOString(),
  serverTime: new Date().toISOString(),
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      sponsors: active,
      serverTime: new Date().toISOString(),
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each([0, 1, 2, 3, 4])(
  "renders %i eligible campaigns once per header/feed/detail with decorative unfocusable copies",
  async (count) => {
    active = ["a", "b", "c", "d"].slice(0, count).map(campaign);
    await act(async () =>
      root.render(
        <PublicSponsorsProvider>
          <SponsorIcons />
          <PostFeed posts={[]} />
          <SponsorMarquee />
        </PublicSponsorsProvider>,
      ),
    );
    expect(
      container.querySelectorAll('[data-sponsor-placement="header"]'),
    ).toHaveLength(count);
    expect(
      container.querySelectorAll('[data-sponsor-placement="feed"]'),
    ).toHaveLength(count);
    expect(
      container.querySelectorAll('[data-sponsor-placement="detail"]'),
    ).toHaveLength(count);
    expect(container.querySelectorAll('[aria-hidden="true"] a')).toHaveLength(
      0,
    );
    expect(
      container.querySelectorAll(".sponsor-wordmark-clones [data-campaign-id]"),
    ).toHaveLength(0);
    for (const a of container.querySelectorAll<HTMLAnchorElement>(
      '[data-sponsor-placement="detail"]',
    ))
      expect(a.href).toMatch(/^https:\/\/[a-d]\.example\.com\/$/);
  },
);
it("refreshes all mounted placements together on foreground and within 30 seconds; expiry uses server-time offset", async () => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  active = [campaign("old")];
  active[0].serverTime = "2026-10-10T14:00:00Z";
  active[0].paidThrough = "2026-10-10T14:01:00Z";
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      sponsors: active,
      serverTime: "2026-10-10T14:00:00Z",
    }),
  }));
  await act(async () =>
    root.render(
      <PublicSponsorsProvider>
        <SponsorIcons />
        <PostFeed posts={[]} />
        <SponsorMarquee />
      </PublicSponsorsProvider>,
    ),
  );
  active = [
    {
      ...active[0],
      title: "new version",
      versionId: "v2",
      wordmarkUrl: "/new.png",
      iconUrl: "/new-icon.png",
      url: "https://new.example.com",
    },
  ];
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(container.querySelectorAll('[data-version-id="v2"]')).toHaveLength(3);
  fetchMock.mockImplementation(async () => ({
    ok: false,
    json: async () => ({}),
  }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  expect(container.querySelectorAll("[data-campaign-id]")).toHaveLength(0);
});
it("keeps sponsor-only sparse Website/Logo filters but excludes App Icons and preserves their newsletter", async () => {
  active = [campaign("a")];
  await act(async () =>
    root.render(
      <PublicSponsorsProvider>
        <WebsiteArchive websites={[]} view="latest" />
        <LogoArchive logos={[]} />
        <DetailSidebarLayout
          appIcon
          newsletterSource="logo-detail"
          navigation={null}
        >
          <p>Icon details</p>
        </DetailSidebarLayout>
      </PublicSponsorsProvider>,
    ),
  );
  expect(
    container.querySelectorAll('[data-sponsor-placement="feed"]'),
  ).toHaveLength(2);
  const icons = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Icons",
  )!;
  await act(async () => icons.click());
  expect(
    container.querySelectorAll('[data-sponsor-placement="feed"]'),
  ).toHaveLength(1);
  expect(container.textContent).toContain("Subscribe to a weekly email");
  expect(
    container.querySelectorAll('[data-sponsor-placement="detail"]'),
  ).toHaveLength(0);
});
