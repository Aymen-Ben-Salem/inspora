// @vitest-environment happy-dom
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Logo } from "@/domain/logo";
import iconFeedOrder from "@/data/icon-feed-order.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (notify) => {
      window.addEventListener("popstate", notify);
      return () => window.removeEventListener("popstate", notify);
    },
    () => window.location.search,
    () => "",
  )),
}));
vi.mock("../feed-motion", () => ({ FeedMotion: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../sponsorship/sponsor-feed", () => ({
  SponsorFeed: ({ ordinary }: { ordinary: { id: string; node: React.ReactNode }[] }) => ordinary.map((item) => <div key={item.id}>{item.node}</div>),
}));
vi.mock("./logo-detail-dialog", () => ({
  LogoDetailDialog: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close detail</button>,
}));

import { LogoArchive } from "./logo-archive";

const logos: Logo[] = (["logo", "icon"] as const).map((kind) => ({
  id: kind, slug: kind, title: kind, kind,
  creator: { id: "creator", name: "Creator", avatarUrl: "/avatar.svg" },
  description: "Work", industry: "Design", colors: [], styles: [], shape: "Square",
  sourceUrl: "https://example.com", createdAt: "2026-10-25", publishedAt: "2026-10-25",
  media: { id: kind, url: `/${kind}.svg`, alt: kind, width: 512, height: 512 },
}));
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({ __NA: true }, "", "/logos");
  for (const method of ["replaceState", "pushState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args) => {
      original(...args);
      // Next only notifies URL subscribers for app-initiated history changes.
      if (!args[0]?.__NA && !args[0]?._N) window.dispatchEvent(new Event("popstate"));
    });
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = (items = logos) => act(async () => root.render(<LogoArchive logos={items} />));
const tab = (label: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!;

it("keeps the icons feed selected after a reload and can switch back to logos", async () => {
  await render();
  await act(async () => tab("Icons").click());
  expect(container.querySelector('[aria-label="View icon icon"]')).not.toBeNull();
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(tab("Icons").getAttribute("aria-pressed")).toBe("true");
  expect(new URLSearchParams(window.location.search).get("kind")).toBe("icon");
  expect(container.querySelector('[aria-label="View logo logo"]')).toBeNull();
  await act(async () => tab("Logos").click());
  expect(tab("Logos").getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('[aria-label="View logo logo"]')).not.toBeNull();
});

it("restores the feed from URL changes and preserves the selection when closing a directly loaded icon", async () => {
  window.history.replaceState(null, "", "/logos?kind=icon&logo=icon&keep=value");
  await render();
  await act(async () => tab("Close detail").click());
  expect(tab("Icons").getAttribute("aria-pressed")).toBe("true");
  expect(window.location.search).toBe("?kind=icon&keep=value");
  await act(async () => window.history.replaceState(null, "", "/logos?kind=logo&keep=value"));
  expect(tab("Logos").getAttribute("aria-pressed")).toBe("true");
  await act(async () => tab("Icons").click());
  expect(new URLSearchParams(window.location.search).get("keep")).toBe("value");
});

it("keeps the fixed icon shuffle through filtering and renders while leaving the logo feed in its incoming order", async () => {
  const icons = iconFeedOrder.ids.slice(0, 3).map((id, index) => ({
    ...logos[1], id, slug: id, title: index === 1 ? "Other icon" : `Pair ${index}`,
  }));
  const secondLogo = { ...logos[0], id: "second-logo", slug: "second-logo", title: "Second logo" };
  const incoming = [logos[0], icons[2], icons[0], secondLogo, icons[1]];
  const visibleIds = () => [...container.querySelectorAll("[data-feed-post-id]")].map((element) => element.getAttribute("data-feed-post-id"));
  window.history.replaceState(null, "", "/logos?kind=icon");
  await render(incoming);
  expect(visibleIds()).toEqual(icons.map((icon) => icon.id));

  async function search(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await search("Pair");
  expect(visibleIds()).toEqual([icons[0].id, icons[2].id]);
  await search("");
  await render([...incoming]);
  expect(visibleIds()).toEqual(icons.map((icon) => icon.id));
  await act(async () => tab("Logos").click());
  expect(visibleIds()).toEqual([logos[0].id, secondLogo.id]);
  await act(async () => tab("Icons").click());
  expect(visibleIds()).toEqual(icons.map((icon) => icon.id));
});
