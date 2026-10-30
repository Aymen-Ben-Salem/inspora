// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { CreatorDirectorySearch } from "./creator-directory-search";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.replace.mockReset();
  window.history.replaceState(null, "", "/admin/creators?page=3&claimsPage=2&saved=true");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const render = (query = "") => act(async () => root.render(<CreatorDirectorySearch query={query} />));
const input = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const wait = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });

it("searches the directory while typing, debounces keystrokes, and starts at the first page", async () => {
  await render();
  await type("Stu");
  await type("Studio");
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(navigation.replace).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/admin/creators?claimsPage=2&q=Studio", { scroll: false });
});

it("searches after deleting characters and restores the directory when cleared", async () => {
  window.history.replaceState(null, "", "/admin/creators?q=Studio&page=4");
  await render("Studio");
  await type("Stu");
  await wait();
  expect(navigation.replace).toHaveBeenLastCalledWith("/admin/creators?q=Stu", { scroll: false });
  await type("");
  await wait();
  expect(navigation.replace).toHaveBeenLastCalledWith("/admin/creators", { scroll: false });
});

it("keeps searches inside Trash while clearing success messages and pagination", async () => {
  window.history.replaceState(null, "", "/admin/creators?view=trash&page=3&restored=true&trashed=true");
  await render();
  await type("Studio");
  await wait();
  expect(navigation.replace).toHaveBeenLastCalledWith("/admin/creators?view=trash&q=Studio", { scroll: false });
});

it("keeps focus and newer text when a preceding search result arrives", async () => {
  await render();
  const field = input();
  field.focus();
  await type("Stu");
  await wait();
  await type("Studio");
  await render("Stu");
  expect(input()).toBe(field);
  expect(document.activeElement).toBe(field);
  expect(field.value).toBe("Studio");
  await wait();
  await type("Studio One");
  await wait();
  await render("Studio");
  expect(field.value).toBe("Studio One");
  await render("Studio One");
  expect(field.value).toBe("Studio One");
  expect(document.activeElement).toBe(field);
});

it("submits immediately with Enter and cancels the queued duplicate search", async () => {
  await render();
  await type("Studio & Co");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/admin/creators?claimsPage=2&q=Studio+%26+Co", { scroll: false });
  await wait();
  expect(navigation.replace).toHaveBeenCalledTimes(1);
});

it("restores the history query and cancels a queued search when going back", async () => {
  await render();
  await type("Unsent");
  window.history.replaceState(null, "", "/admin/creators?q=Earlier");
  await act(async () => window.dispatchEvent(new Event("popstate")));
  await render("Earlier");
  await wait();
  expect(input().value).toBe("Earlier");
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("cancels a queued search when leaving the directory", async () => {
  await render();
  await type("Unsent");
  await act(async () => root.render(null));
  await wait();
  expect(navigation.replace).not.toHaveBeenCalled();
});
