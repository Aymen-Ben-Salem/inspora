import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { Logo } from "@/domain/logo";

vi.mock("../post-dialog", () => ({ PostDialog: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../detail-motion", () => ({ DetailMotion: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../work-analytics", () => ({ WorkAnalytics: () => null }));
vi.mock("../post-close-button", () => ({
  PostCloseButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  postNavigationControlClassName: "navigation-control",
}));

import { LogoDetailDialog } from "./logo-detail-dialog";

const logo: Logo = {
  id: "work", slug: "work", title: "Work", kind: "icon",
  creator: { id: "creator", name: "Creator", avatarUrl: "/avatar.svg" },
  description: "Work", industry: "Design", colors: [], styles: [], shape: "Square",
  sourceUrl: "https://example.com/original", createdAt: "2026-10-25", publishedAt: "2026-10-25",
  media: { id: "media", url: "/icon.svg", alt: "Icon", width: 512, height: 512 },
};

it.each(["icon", "logo"] as const)("offers image copying and downloading with the correct source action for %s details", (kind) => {
  const markup = renderToStaticMarkup(<LogoDetailDialog logo={{ ...logo, kind }} onClose={() => {}} onPrevious={() => {}} onNext={() => {}} />);
  expect(markup).toContain("Copy image");
  expect(markup).toContain("Download");
  expect(markup.includes('href="https://example.com/original"')).toBe(kind === "logo");
  expect(markup.includes("View Original")).toBe(kind === "logo");
});
