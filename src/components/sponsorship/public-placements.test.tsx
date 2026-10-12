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
    const clones = container.querySelectorAll<HTMLAnchorElement>(
      ".sponsor-wordmark-clones a",
    );
    expect(clones.length).toBe(count ? count * 2 : 0);
    for (const clone of clones) {
      expect(clone.tabIndex).toBe(-1);
      expect(clone.href).toMatch(/^https:\/\/[a-d]\.example\.com\/$/);
      expect(clone.hasAttribute("data-sponsor-copy")).toBe(true);
      expect(active.map(sponsor => sponsor.id)).toContain(clone.dataset.campaignId);
    }
    expect(
      container.querySelectorAll(".sponsor-wordmark-clones [data-sponsor-placement]"),
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
  expect(container.querySelectorAll('[data-sponsor-placement][data-version-id="v2"]')).toHaveLength(3);
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
it.each(["unavailable", "offline"])(
  "expires the initial Design sponsors and shows the empty feed when placements are %s from the first refresh",
  async (failure) => {
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
    const initial = [
      {
        ...campaign("initial"),
        serverTime: "2026-10-10T14:00:00Z",
        paidThrough: "2026-10-10T14:01:00Z",
      },
    ];
    if (failure === "offline")
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    else fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await act(async () =>
      root.render(
        <PublicSponsorsProvider>
          <PostFeed posts={[]} sponsors={initial} />
        </PublicSponsorsProvider>,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59000);
    });
    expect(
      container.querySelectorAll('[data-sponsor-placement="feed"]'),
    ).toHaveLength(1);
    expect(container.textContent).not.toContain("No posts in this category yet.");
    await act(async () =>
      root.render(
        <PublicSponsorsProvider>
          <PostFeed posts={[]} sponsors={[...initial]} />
        </PublicSponsorsProvider>,
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      container.querySelectorAll('[data-sponsor-placement="feed"]'),
    ).toHaveLength(0);
    expect(container.textContent).toContain("No posts in this category yet.");
  },
);
it.each([0, 1])(
  "keeps a successful refresh with %i sponsors authoritative when the initial Design list is rendered again",
  async (count) => {
    active = count ? [campaign("fresh")] : [];
    const initial = [campaign("stale")];
    for (const sponsors of [initial, [...initial]]) {
      await act(async () =>
        root.render(
          <PublicSponsorsProvider>
            <PostFeed posts={[]} sponsors={sponsors} />
          </PublicSponsorsProvider>,
        ),
      );
      expect(
        container.querySelectorAll('[data-sponsor-placement="feed"]'),
      ).toHaveLength(count);
      expect(container.querySelector('[data-campaign-id="stale"]')).toBeNull();
      if (count)
        expect(container.querySelector('[data-campaign-id="fresh"]')).not.toBeNull();
      else expect(container.textContent).toContain("No posts in this category yet.");
    }
  },
);
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
