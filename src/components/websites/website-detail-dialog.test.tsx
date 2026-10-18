import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { Website } from "@/domain/website";

vi.mock("next/navigation", () => ({ usePathname: () => "/websites" }));
vi.mock("../looping-video", () => ({
  LoopingVideo: ({ src, poster, className, "aria-label": label }: ComponentPropsWithoutRef<"video">) => <video src={src} poster={poster} className={className} aria-label={label} />,
}));
vi.mock("../post-dialog", () => ({
  PostDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../post-close-button", () => ({
  PostCloseButton: () => null,
  postNavigationControlClassName: "",
}));
vi.mock("../work-analytics", () => ({ WorkAnalytics: () => null }));
vi.mock("../detail-sidebar-primitives", async (importOriginal) => ({
  ...await importOriginal<typeof import("../detail-sidebar-primitives")>(),
  DetailArrowIcon: () => null,
  DetailCloseIcon: () => null,
  DetailGlobeIcon: () => null,
  DetailIntro: ({ title }: { title: string }) => <h2>{title}</h2>,
  DetailSidebarLayout: ({ intro, actions, navigation, children }: { intro: ReactNode; actions: ReactNode; navigation: ReactNode; children: ReactNode }) => <aside>{intro}{actions}{navigation}{children}</aside>,
  DetailSidebarNavigation: () => null,
  detailOriginalLinkClassName: "",
  detailSecondaryActionClassName: "",
}));

import { WebsiteDetailDialog } from "./website-detail-dialog";

it.each([true, false])("opens the recording and shows technologies only when provided (%s)", (hasTechnologies) => {
  const website: Website = {
    id: "website", slug: "paper", title: "Paper", tagline: "Website", description: "Paper website",
    creator: { id: "creator", name: "Studio", avatarUrl: "/avatar.svg" },
    categories: ["SaaS"], themes: ["Light"], colors: ["White"], technologies: hasTechnologies ? ["React", "Next.js"] : [], sourceUrl: "https://example.com",
    isFeatured: false, createdAt: "2026-10-18T00:00:00Z", publishedAt: "2026-10-18T00:00:00Z",
    favicon: { id: "favicon", role: "favicon", url: "/favicon.webp", alt: "Icon", width: 64, height: 64 },
    recording: {
      id: "recording", role: "recording", url: "/original.webm", posterUrl: "/poster.webp",
      alt: "Paper recording", width: 1920, height: 1080,
      videoPreview: { url: "/feed-preview.mp4", storageKey: "websites/preview.mp4", width: 960, height: 540, bytes: 1000, format: "mp4" },
    },
  };
  const html = renderToStaticMarkup(<WebsiteDetailDialog website={website} onClose={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />);

  expect(html).toContain('src="/original.webm"');
  expect(html).toContain('poster="/poster.webp"');
  expect(html).toContain('aria-label="Paper recording"');
  expect(html).toContain("object-contain");
  expect(html).toContain("data-post-dialog-gallery");
  expect(html).toContain("data-post-dialog-hero");
  expect(html).toContain("View Site");
  expect(html).toContain("Copy link");
  expect(html).toContain("Download video");
  expect(html).not.toContain("feed-preview.mp4");
  expect(html).not.toContain("Website media views");
  expect(html).not.toContain("data-website-media-tab");
  expect(html).not.toContain("Sections");
  if (hasTechnologies) {
    expect(html).toContain(">Technologies<");
    expect(html).toContain(">React<");
    expect(html).toContain(">Next.js<");
  } else {
    expect(html).not.toContain(">Technologies<");
  }
});
