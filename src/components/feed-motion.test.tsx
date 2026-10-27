// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedMotion } from "./feed-motion";

let container: HTMLDivElement;
let root: Root | undefined;
let observer: MutationObserver;
let hidden: Set<string>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  hidden = new Set();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const card = mutation.target as HTMLElement;
      if (!card.matches("[data-feed-card]")) continue;
      if ([mutation.oldValue, card.getAttribute("style")].some((style) => style?.includes("visibility: hidden"))) hidden.add(card.id);
    }
  });
  observer.observe(container, { attributes: true, attributeFilter: ["style"], attributeOldValue: true, subtree: true });
});

afterEach(async () => {
  observer.disconnect();
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
});

const card = (id: string) => <article key={id} id={id} data-feed-card>{id}</article>;
async function mount(element: ReactNode) {
  root = createRoot(container);
  await act(async () => root!.render(element));
}

it("keeps already-visible server content visible throughout hydration when the initial animation is disabled", async () => {
  const element = <FeedMotion itemCount={1} animateOnMount={false}>{card("existing")}</FeedMotion>;
  container.innerHTML = renderToString(element);
  const original = container.querySelector("article");
  await act(async () => { root = hydrateRoot(container, element); });
  expect(container.querySelector("article")).toBe(original);
  expect(hidden).toEqual(new Set());
});

it("continues to reveal newly added cards without hiding the existing cards", async () => {
  await mount(<FeedMotion itemCount={1} animateOnMount={false}>{card("existing")}</FeedMotion>);
  expect(hidden).toEqual(new Set());
  await act(async () => root!.render(<FeedMotion itemCount={2} animateOnMount={false}>{[card("existing"), card("new")]}</FeedMotion>));
  expect(hidden).toEqual(new Set(["new"]));
});

it("preserves the initial reveal by default for other feeds", async () => {
  await mount(<FeedMotion itemCount={1}>{card("animated")}</FeedMotion>);
  expect(hidden).toEqual(new Set(["animated"]));
});
