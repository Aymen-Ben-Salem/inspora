import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Logo } from "@/domain/logo";
import type { Website } from "@/domain/website";

const links = vi.hoisted(() => [] as Array<{ href: string; prefetch?: boolean }>);
vi.mock("next/link", () => ({ default: ({ href, prefetch, children, ...props }: { href: string; prefetch?: boolean; children: React.ReactNode }) => {
  links.push({ href, prefetch });
  return <a href={href} {...props}>{children}</a>;
} }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/", useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

import { SiteNavbarClient } from "./site-navbar-client";
import { MobileNavigationOverlay } from "./mobile-navigation-overlay";
import { LogoArchive } from "./logos/logo-archive";
import { WebsiteArchive } from "./websites/website-archive";
import { WebsiteCard } from "./websites/website-card";

beforeEach(() => { links.length = 0; });

it.each(["desktop", "mobile"])("fully prefetches the public archive tabs in %s navigation", (mode) => {
  renderToStaticMarkup(mode === "desktop" ? <SiteNavbarClient page="design" desktopAuth={null} mobileAuth={null} /> :
    <MobileNavigationOverlay closing={false} onClose={() => {}} onClosed={() => {}} onContact={() => {}} onAction={() => {}} activeHref="/" auth={null} />);
  for (const href of ["/", "/logos", "/websites"]) {
    expect(links.find((link) => link.href === href && link.prefetch === true), href).toBeDefined();
  }
  expect(links.some((link) => link.href === "/saved" && link.prefetch === true)).toBe(false);
});

const logos: Logo[] = Array.from({ length: 6 }, (_, index) => ({
  id: `logo-${index}`, slug: `logo-${index}`, title: `Logo ${index}`, kind: "logo",
  creator: { id: "creator", name: "Creator", avatarUrl: "/avatar.svg" },
  description: "Logo", industry: "Design", colors: ["Blue"], styles: ["Minimal"], shape: "Wordmark",
  sourceUrl: "https://example.com", createdAt: "2026-10-14T00:00:00Z", publishedAt: "2026-10-14T00:00:00Z",
  media: { id: `media-${index}`, url: `/logo-${index}.webp`, alt: `Logo ${index}`, width: 640, height: 400 },
}));

it("prioritizes the first logo row and keeps later images lazy", () => {
  const html = renderToStaticMarkup(<LogoArchive logos={logos} />);
  const images = [...html.matchAll(/<img[^>]*alt="Logo (\d)"[^>]*>/g)];
  expect(images).toHaveLength(6);
  for (const [tag, index] of images) {
    expect(tag).toContain(Number(index) < 4 ? 'loading="eager"' : 'loading="lazy"');
    expect(tag).toContain(Number(index) < 4 ? 'fetchPriority="high"' : 'fetchPriority="auto"');
  }
});

const websites: Website[] = Array.from({ length: 5 }, (_, index) => ({
  id: `site-${index}`, slug: `site-${index}`, title: `Site ${index}`, tagline: "Website", description: "Website",
  creator: { id: "creator", name: "Creator", avatarUrl: "/avatar.svg" },
  categories: ["Design"], themes: ["Light"], colors: ["Blue"], sourceUrl: "https://example.com", isFeatured: false,
  createdAt: "2026-10-14T00:00:00Z", publishedAt: "2026-10-14T00:00:00Z",
  favicon: { id: `icon-${index}`, role: "favicon", url: `/icon-${index}.webp`, alt: "Icon", width: 64, height: 64 },
  recording: { id: `recording-${index}`, role: "recording", url: `/recording-${index}.mp4`, posterUrl: `/poster-${index}.webp`, alt: "Website", width: 1920, height: 1080,
    videoPreview: { url: `/preview-${index}.mp4`, storageKey: `websites/preview-${index}.mp4`, width: 960, height: 540, bytes: 1000, format: "mp4" } },
}));

it("preloads only the first website posters without eagerly downloading every video", () => {
  const html = renderToStaticMarkup(<WebsiteArchive websites={websites} view="latest" />);
  for (let index = 0; index < websites.length; index++) {
    expect(html.includes(`rel="preload" as="image" href="/poster-${index}.webp"`)).toBe(index < 3);
    expect(html.includes(`poster="/poster-${index}.webp"`)).toBe(index < 3);
  }
  expect(html).not.toContain('preload="auto"');
});

it("keeps existing website-card posters available before hydration for saved and creator feeds", () => {
  const html = renderToStaticMarkup(<WebsiteCard website={websites[0]} onSelect={() => {}} />);
  expect(html).toContain('poster="/poster-0.webp"');
});
