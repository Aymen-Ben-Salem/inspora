// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActiveSponsor } from "@/domain/sponsor";

const sponsor: ActiveSponsor = { id: "sponsor", title: "Sponsor", url: "https://example.com", mediaType: "image", mediaUrl: "/artwork.png", mediaWidth: 1200, mediaHeight: 800, mediaAlt: "Sponsor", iconUrl: "/compact-icon.png", feedDescription: "Made for focused work.", tagline: "Existing tagline" };
vi.mock("./public-sponsors", () => ({ usePublicSponsors: () => ({ sponsors: [sponsor] }) }));
vi.mock("../feed-motion", () => ({ FeedMotion: ({ children }: { children: ReactNode }) => children }));
vi.mock("../row-first-masonry", () => ({ RowFirstMasonry: ({ children, fixedColumns }: { children: ReactNode; fixedColumns: boolean }) =>
  <div className="feed-grid" data-fixed-columns={fixedColumns ? "" : undefined}>{children}</div> }));
import { SponsorFeed } from "./sponsor-feed";

let container: HTMLDivElement, root: Root;
let columns: number, resize: () => void;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  columns = 4;
  vi.stubGlobal("getComputedStyle", () => ({ gridTemplateColumns: Array(columns).fill("300px").join(" ") }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const ordinary = (ratio: number, count = 12) => Array.from({ length: count }, (_, index) => ({
  id: String(index), mediaAspectRatio: ratio, node: <article key={index} data-website={index} />,
}));
const frame = () => container.querySelector<HTMLAnchorElement>('[aria-label="Sponsored: Sponsor"]')!;
const ratio = () => {
  const [width, height = 1] = frame().style.aspectRatio.split("/").map(Number);
  return width / height;
};

it.each([1, 2, 4])("matches the recording proportions in a %i-column website feed", async (count) => {
  columns = count;
  await act(async () => root.render(<SponsorFeed ordinary={ordinary(16 / 9)} layout="websites" />));
  expect(ratio(), frame().style.aspectRatio).toBeCloseTo(16 / 9);
  expect(container.querySelectorAll("[data-website]")).toHaveLength(12);

  await act(async () => root.render(<SponsorFeed ordinary={ordinary(4 / 3)} layout="websites" />));
  expect(ratio(), frame().style.aspectRatio).toBeCloseTo(4 / 3);
  columns = count === 1 ? 4 : 1;
  await act(async () => resize());
  expect(ratio(), frame().style.aspectRatio).toBeCloseTo(4 / 3);
});

it.each(["masonry", "websites"] as const)("renders repeated %s placements in their fixed slots with separate nodes", async layout => {
  const mount = (count: number) => root.render(<SponsorFeed ordinary={ordinary(16 / 9, count)} layout={layout} hasMore />);
  await act(async () => mount(12));
  const grid = container.querySelector(".feed-grid, [data-sponsor-grid]")!;
  const firstCard = grid.children[3];
  expect(firstCard.getAttribute("data-campaign-id")).toBe("sponsor");
  if (layout === "masonry") expect(grid.hasAttribute("data-fixed-columns")).toBe(true);
  await act(async () => mount(36));
  const cards = Array.from(grid.children);
  expect(cards.flatMap((card, index) => card.hasAttribute("data-campaign-id") ? [index] : [])).toEqual([3, 17, 32]);
  expect(cards[3]).toBe(firstCard);
});

it("matches a recording in the sponsor's row when recordings have different crops", async () => {
  const items = ordinary(16 / 9).map((item, index) => ({ ...item, mediaAspectRatio: (index + 2) / 2 }));
  await act(async () => root.render(<SponsorFeed ordinary={items} layout="websites" />));
  const cards = Array.from(container.querySelector('[data-sponsor-grid]')!.children);
  const sponsorIndex = cards.findIndex((card) => card.hasAttribute("data-campaign-id"));
  const rowStart = Math.floor(sponsorIndex / columns) * columns;
  const recording = cards.slice(rowStart, rowStart + columns).find((card) => card.hasAttribute("data-website"))!;
  const recordingIndex = Number(recording.getAttribute("data-website"));
  expect(ratio(), frame().style.aspectRatio).toBe(items[recordingIndex].mediaAspectRatio);
});

it("keeps the artwork proportions in masonry feeds and when no website recording is available", async () => {
  await act(async () => root.render(<SponsorFeed ordinary={ordinary(16 / 9)} />));
  expect(frame().style.aspectRatio.replaceAll(" ", "")).toBe("1200/800");
  await act(async () => root.render(<SponsorFeed key="empty-websites" ordinary={[]} layout="websites" />));
  expect(frame().style.aspectRatio.replaceAll(" ", "")).toBe("1200/800");
});

it("adds the existing icon, public name and short description only to website feed cards", async () => {
  await act(async () => root.render(<SponsorFeed ordinary={ordinary(16 / 9)} layout="websites" />));
  const caption = container.querySelector<HTMLAnchorElement>('a[aria-label="Visit Sponsor website"]')!;
  expect(caption.href).toBe(sponsor.url + "/");
  expect(caption.querySelector("h2")?.textContent).toBe(sponsor.title);
  expect(caption.querySelector("p")?.textContent).toBe(sponsor.feedDescription);
  expect(caption.querySelector("img")?.getAttribute("src")).toBe(sponsor.iconUrl);
  expect(caption.querySelector("img")?.width).toBe(27);
  expect(caption.textContent).not.toContain(sponsor.tagline);

  await act(async () => root.render(<SponsorFeed ordinary={ordinary(16 / 9)} />));
  const card = container.querySelector('[data-sponsor-placement="feed"]')!;
  expect(card.querySelector('a[aria-label="Visit Sponsor website"]')).toBeNull();
  expect(card.querySelector('img[src="/compact-icon.png"]')).toBeNull();
  expect(card.textContent).not.toContain(sponsor.feedDescription);
  expect(card.textContent).not.toContain(sponsor.tagline);
});
