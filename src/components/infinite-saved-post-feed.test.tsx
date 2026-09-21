import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const previousState = vi.hoisted(() => ({ seeds: [] as unknown[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => react.useState(() =>
      previousState.seeds.length ? previousState.seeds.shift()
        : typeof initial === "function" ? initial() : initial),
  };
});

vi.mock("@/domain/post", () => import("../domain/post"));
vi.mock("@/lib/detail-query", () => import("../lib/detail-query"));
vi.mock("./logos/logo-detail-dialog", () => ({
  LogoDetailDialog: () => null,
}));
vi.mock("./websites/website-detail-dialog", () => ({
  WebsiteDetailDialog: () => null,
}));

vi.mock("@/domain/saved-post", () => ({
  SAVED_CATEGORIES: [
    "Web",
    "Branding",
    "Product",
    "Motion",
    "Illustration",
    "3D",
    "Print",
    "Logos",
    "Websites",
  ],
}));

import { InfiniteSavedPostFeed, savedItemOpenHref } from "./infinite-saved-post-feed";

const savedStatus = vi.hoisted(() => ({ value: true }));
vi.mock("./saved-posts-provider", () => ({ useSavedPosts: () => ({ status: () => savedStatus.value }) }));
vi.mock("./post-card", () => ({ PostCard: () => <div>Saved fixture card</div> }));
vi.mock("./feed-motion", () => ({ FeedMotion: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./row-first-masonry", () => ({ RowFirstMasonry: ({ children }: { children: React.ReactNode }) => children }));

describe("InfiniteSavedPostFeed", () => {
  it("accepts fresh server cards and counts when returning to an already mounted Saved page", () => {
    const oldPage = { items: [], nextCursor: null };
    previousState.seeds = [oldPage.items, oldPage.nextCursor, oldPage, "idle", undefined];
    savedStatus.value = true;
    const markup = renderToStaticMarkup(<InfiniteSavedPostFeed
      initialPage={{ items: [{ id: "new-save", category: "Web" } as never], nextCursor: null }}
      initialTotal={1} initialCounts={{ Web: 1 }} />);
    expect(markup).toContain("Saved fixture card");
    expect(markup).toContain("1</span> item you saved for later");
    expect(markup).toContain("Web (1)");
  });
  it("removes a sidebar-unsaved card and count immediately, and restores both on rollback", () => {
    const render = () => renderToStaticMarkup(<InfiniteSavedPostFeed
      initialPage={{ items: [{ id: "fixture", category: "Web" } as never], nextCursor: null }}
      initialTotal={1} initialCounts={{ Web: 1 }} />);
    savedStatus.value = true;
    expect(render()).toContain("Saved fixture card");
    savedStatus.value = false;
    expect(render()).not.toContain("Saved fixture card");
    expect(render()).toContain("0</span> items you saved for later");
    expect(render()).not.toContain("Web (1)");
    savedStatus.value = true;
    expect(render()).toContain("Saved fixture card");
    expect(render()).toContain("1</span> item you saved for later");
  });
  it("keeps logo and website details in the saved-page context", () => {
    expect(savedItemOpenHref({ kind: "logo", id: "logo-id", category: "Logos", logo: { slug: "north-star" } } as never)).toBe("/saved?logo=north-star");
    expect(savedItemOpenHref({ kind: "website", id: "website-id", category: "Websites", website: { slug: "studio-site" } } as never)).toBe("/saved?website=studio-site");
    expect(savedItemOpenHref({ kind: "logo", id: "logo-id", category: "Logos", logo: { slug: "north-star" } } as never, "?category=Logos&website=old")).toBe("/saved?category=Logos&logo=north-star");
  });

  it("matches the saved-page count and populated category controls", () => {
    const markup = renderToStaticMarkup(
      <InfiniteSavedPostFeed
        initialPage={{ items: [], nextCursor: null }}
        initialTotal={6}
        initialCounts={{ Web: 3, Branding: 2, Illustration: 1, Logos: 2, Websites: 1 }}
      />,
    );

    expect(markup).toContain("6</span> items you saved for later");
    expect(markup).toContain("Web (3)");
    expect(markup).toContain("Branding (2)");
    expect(markup).toContain("Illustration (1)");
    expect(markup).toContain("Logos (2)");
    expect(markup).toContain("Websites (1)");
    expect(markup).not.toContain("Product (0)");
  });
});
