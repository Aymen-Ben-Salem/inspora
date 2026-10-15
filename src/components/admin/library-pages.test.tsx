import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ posts: vi.fn(), logos: vi.fn(), websites: vi.fn(), link: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => {
  mocks.link(href, prefetch);
  return <a href={href} {...props}>{children}</a>;
} }));
vi.mock("@/features/admin/actions", () => ({
  archivePostAction: vi.fn(), deletePostAction: vi.fn(), setPostFeaturedAction: vi.fn(),
  archiveLogoAction: vi.fn(), deleteLogoAction: vi.fn(),
  archiveWebsiteAction: vi.fn(), deleteWebsiteAction: vi.fn(), setWebsiteFeaturedAction: vi.fn(),
}));
vi.mock("@/features/admin/posts-repository", () => ({ getAdminPosts: mocks.posts }));
vi.mock("@/features/admin/logos-repository", () => ({ getAdminLogos: mocks.logos }));
vi.mock("@/features/admin/websites-repository", () => ({ getAdminWebsites: mocks.websites }));
import PostsPage from "@/app/admin/posts/page";
import LogosPage from "@/app/admin/logos/page";
import WebsitesPage from "@/app/admin/websites/page";
import { AdminLibraryPagination } from "./library-pagination";

beforeEach(() => { vi.clearAllMocks(); });

it.each([
  [PostsPage, mocks.posts, { view: "featured", page: "2" }, { view: "featured", page: 2 }],
  [LogosPage, mocks.logos, { page: "2" }, { page: 2 }],
  [WebsitesPage, mocks.websites, { view: "featured", page: "2" }, { view: "featured", page: 2 }],
] as const)("keeps library totals and pagination while fetching only the requested page", async (Page, read, params, expected) => {
  read.mockResolvedValue({ items: [], counts: { total: 100, published: 70, draft: 20, archived: 10 }, page: 2, totalPages: 5 });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
  expect(read).toHaveBeenCalledExactlyOnceWith(expected);
  expect(html).toContain("100 total");
  expect(html).toContain("70 published");
  expect(html).toContain("Page 2 of 5");
  expect(mocks.link.mock.calls.every(([, prefetch]) => prefetch === false)).toBe(true);
});

it("renders lightweight post thumbnails and keeps the full media count", async () => {
  mocks.posts.mockResolvedValue({
    page: 1, totalPages: 2, counts: { total: 30, published: 30, draft: 0, archived: 0 },
    items: [{ id: "work-1", slug: "work-1", title: "Work", category: "Branding", status: "published", isFeatured: true,
      createdAt: new Date("2026-10-15"), creator: { name: "Creator" }, mediaCount: 7,
      media: [{ type: "video", url: "/original.mp4", posterUrl: "/poster.webp", alt: "Work", width: 1200 }],
    }],
  });
  const html = renderToStaticMarkup(await PostsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("7 media");
  expect(html).toContain("/poster.webp");
  expect(html).not.toContain("/original.mp4");
  expect(html).not.toContain("<video");
  expect(mocks.link.mock.calls.every(([, prefetch]) => prefetch === false)).toBe(true);
});

it("keeps the featured filter when paging and removes page=1 for the first page", () => {
  const html = renderToStaticMarkup(<AdminLibraryPagination path="/admin/posts" page={2} totalPages={4} view="featured" />);
  expect(html).toContain('href="/admin/posts?view=featured"');
  expect(html).toContain('href="/admin/posts?view=featured&amp;page=3"');
});

it("preserves creator search and directory position when paging claims", () => {
  const html = renderToStaticMarkup(<AdminLibraryPagination path="/admin/creators" page={2} totalPages={4} pageParam="claimsPage" query={{ q: "Studio", page: "3" }} />);
  expect(html).toContain('href="/admin/creators?q=Studio&amp;page=3"');
  expect(html).toContain('href="/admin/creators?q=Studio&amp;page=3&amp;claimsPage=3"');
});
