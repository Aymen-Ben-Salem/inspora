// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Website } from "@/domain/website";

vi.mock("../use-archive-detail", () => ({ useArchiveDetail: () => ({ selectedSlug: null, select: vi.fn(), close: vi.fn() }) }));
vi.mock("../view-filter", () => ({ ViewFilter: () => null }));
vi.mock("../sponsorship/sponsor-feed", () => ({
  SponsorFeed: ({ ordinary }: { ordinary: { id: string; node: ReactNode }[] }) => ordinary.map((item) => <div key={item.id}>{item.node}</div>),
}));
vi.mock("./website-card", () => ({ WebsiteCard: ({ website }: { website: Website }) => <article data-website-id={website.id}>{website.title}</article> }));
vi.mock("./website-detail-dialog", () => ({ WebsiteDetailDialog: () => null }));

import { WebsiteArchive } from "./website-archive";

const websites: Website[] = [
  { id: "blue", categories: ["Portfolio"], themes: ["Light"], colors: ["Blue"] },
  { id: "green", categories: ["Shop"], themes: ["Dark"], colors: ["Green"] },
  { id: "both", categories: ["Portfolio", "Shop"], themes: ["Light", "Dark"], colors: ["Blue", "Green"] },
  { id: "other", categories: ["Editorial"], themes: ["System"], colors: ["Red"] },
].map((site) => ({
  ...site, slug: site.id, title: site.id, tagline: "Website", description: "Website",
  creator: { id: "creator", name: "Creator", avatarUrl: "/avatar.svg" },
  technologies: [], sourceUrl: "https://example.com", isFeatured: false,
  createdAt: "2026-10-27", publishedAt: "2026-10-27",
  favicon: { id: `icon-${site.id}`, role: "favicon", url: "/icon.webp", alt: "Icon", width: 64, height: 64 },
  recording: { id: `recording-${site.id}`, role: "recording", url: "/recording.mp4", posterUrl: "/poster.webp", alt: "Website", width: 1920, height: 1080,
    videoPreview: { url: "/preview.mp4", storageKey: "websites/preview.mp4", width: 960, height: 540, bytes: 1000, format: "mp4" } },
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<WebsiteArchive websites={websites} view="latest" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const visible = () => [...container.querySelectorAll("[data-website-id]")].map((element) => element.getAttribute("data-website-id"));
async function toggle(menuLabel: string, value: string) {
  const menu = [...container.querySelectorAll("details")].find((element) => element.querySelector("summary")?.textContent?.startsWith(menuLabel))!;
  menu.open = true;
  const option = [...menu.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent?.startsWith(value))!;
  await act(async () => option.click());
}

it.each([
  ["Category", "Portfolio", "Shop"],
  ["Theme", "Light", "Dark"],
  ["Color", "Blue", "Green"],
])("matches either selected %s option and restores all websites when deselected", async (menu, first, second) => {
  expect(visible()).toEqual(["blue", "green", "both", "other"]);
  await toggle(menu, first);
  expect(visible()).toEqual(["blue", "both"]);
  await toggle(menu, second);
  expect(visible()).toEqual(["blue", "green", "both"]);
  await toggle(menu, first);
  expect(visible()).toEqual(["green", "both"]);
  await toggle(menu, second);
  expect(visible()).toEqual(["blue", "green", "both", "other"]);
});

it("matches options across different menus while keeping text search as a constraint", async () => {
  await toggle("Color", "Blue");
  await toggle("Category", "Shop");
  expect(visible()).toEqual(["blue", "green", "both"]);
  await toggle("Theme", "System");
  expect(visible()).toEqual(["blue", "green", "both", "other"]);

  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  async function type(value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await type("blue");
  expect(visible()).toEqual(["blue", "both"]);
  await type("missing");
  expect(visible()).toEqual([]);
  expect(container.textContent).toContain("No websites match these filters.");
  await type("");
  expect(visible()).toEqual(["blue", "green", "both", "other"]);
});
