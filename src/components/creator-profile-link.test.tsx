// @vitest-environment happy-dom
import type { Route } from "next";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const prefetch = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));
vi.mock("next/link", () => ({
  default: ({ prefetch: enabled, ...props }: ComponentProps<"a"> & { prefetch: boolean }) =>
    <a {...props} data-prefetch={String(enabled)} />,
}));

import { CreatorProfileLink } from "./creator-profile-link";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  prefetch.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(props: Partial<ComponentProps<typeof CreatorProfileLink>> = {}) {
  act(() => root.render(<CreatorProfileLink href={"/creators/alex" as Route} {...props}>Alex</CreatorProfileLink>));
  return container.querySelector("a")!;
}

it("does not prefetch just because a creator link is mounted or rendered again", () => {
  const link = render();
  render();
  expect(link.getAttribute("data-prefetch")).toBe("false");
  expect(prefetch).not.toHaveBeenCalled();
});

it.each(["pointerover", "focusin", "touchstart"])("prefetches once on %s and deduplicates further intent", (type) => {
  const link = render();
  act(() => link.dispatchEvent(new Event(type, { bubbles: true })));
  for (const nextType of ["pointerover", "focusin", "touchstart"]) {
    act(() => link.dispatchEvent(new Event(nextType, { bubbles: true })));
  }
  expect(prefetch).toHaveBeenCalledExactlyOnceWith("/creators/alex");
  expect(link.getAttribute("data-prefetch")).toBe("false");
});

it.each([
  ["pointerover", "onPointerEnter"],
  ["focusin", "onFocus"],
  ["touchstart", "onTouchStart"],
] as const)("preserves the caller's %s handler and honors cancellation", (type, prop) => {
  const handler = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
  const link = render({ [prop]: handler });
  act(() => link.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })));
  expect(handler).toHaveBeenCalledOnce();
  expect(prefetch).not.toHaveBeenCalled();
});

it("prefetches the new destination when a reused card changes creators", () => {
  let link = render();
  act(() => link.dispatchEvent(new Event("focusin", { bubbles: true })));
  link = render({ href: "/creators/sam" as Route });
  expect(prefetch).toHaveBeenCalledTimes(1);
  act(() => link.dispatchEvent(new Event("focusin", { bubbles: true })));
  expect(prefetch.mock.calls).toEqual([["/creators/alex"], ["/creators/sam"]]);
});

it("preserves normal anchor attributes and click handling without intercepting navigation", () => {
  const onClick = vi.fn();
  const link = render({ onClick, className: "focus-ring avatar", "aria-label": "View Alex's profile", target: "_blank", rel: "noopener" });
  expect(link.getAttribute("href")).toBe("/creators/alex");
  expect(link.className).toBe("focus-ring avatar");
  expect(link.getAttribute("aria-label")).toBe("View Alex's profile");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener");
  let preventedByLink: boolean | undefined;
  document.body.addEventListener("click", (event) => {
    preventedByLink = event.defaultPrevented;
    event.preventDefault(); // Stop Happy DOM from opening a real network connection.
  }, { once: true });
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  act(() => link.dispatchEvent(event));
  expect(onClick).toHaveBeenCalledOnce();
  expect(preventedByLink).toBe(false);
});
