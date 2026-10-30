// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, href, prefetch, ...props }: { children: ReactNode; href: string; prefetch?: boolean }) => <a href={href} data-prefetch={String(prefetch)} {...props}>{children}</a> }));
import { CreatorWorkDrawer } from "./creator-work-drawer";
import { CreatorManager } from "./creator-manager";

const creator = { id: "11111111-1111-4111-8111-111111111111", name: "Studio One", username: "studio_one", workCount: 30,
  avatarUrl: "/avatar.webp", editedFields: [], recordOrigin: "preview" as const, createdAt: "2026-10-15", updatedAt: "2026-10-15", pendingClaimCount: 0 };
const items = [{ id: "work-1", kind: "design", title: "Blue landing page", status: "draft", createdAt: "2026-10-15T00:00:00Z", thumbnailUrl: "/small.webp", thumbnailAlt: "Blue landing page" }];
const response = (nextCursor: string | null = null) => ({ ok: true, json: async () => ({ items, nextCursor }) });
const fetchMock = vi.fn();
let container: HTMLDivElement;
let root: Root;
let trigger: HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(response());
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  trigger = document.createElement("button");
  trigger.textContent = "Open";
  document.body.append(trigger);
  trigger.focus();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); trigger.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function type(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label)!;
}

it("fetches nothing on the creator tab until View work is clicked, then opens that creator's work", async () => {
  const action = vi.fn().mockResolvedValue({ status: "idle" });
  await act(async () => root.render(<CreatorManager creators={[creator]} claims={[]} saveAction={action} trashAction={action} restoreAction={action} reviewAction={async () => {}} lockExistingCreators={false} />));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="View work by Studio One"]')!.click());
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(`/admin/creators/${creator.id}/works`);
  expect(document.activeElement).toBe(container.querySelector('input[type="search"]'));
  expect(container.querySelector("dialog")?.textContent).toContain("Blue landing page");
  expect(container.querySelector("dialog a")?.getAttribute("data-prefetch")).toBe("false");
  expect(container.querySelector("video")).toBeNull();
});

it("debounces search, resets pagination, and never requests every keystroke", async () => {
  fetchMock.mockResolvedValue(response("next-page"));
  await act(async () => root.render(<CreatorWorkDrawer creator={creator} onDismiss={() => {}} />));
  await act(async () => button("Next").click());
  expect(fetchMock.mock.lastCall![0]).toContain("cursor=next-page");
  await type("Blu");
  await type("Blue");
  expect(button("Next").disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.lastCall![0]).toBe(`/admin/creators/${creator.id}/works?q=Blue`);
  expect(button("Previous").disabled).toBe(true);
});

it("closes with Escape, aborts its request, unlocks scrolling and restores focus", async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? <CreatorWorkDrawer creator={creator} onDismiss={() => setOpen(false)} /> : null;
  }
  await act(async () => root.render(<Harness />));
  const signal = fetchMock.mock.calls[0][1].signal;
  expect(document.documentElement.style.overflow).toBe("hidden");
  await act(async () => container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(container.querySelector("dialog")).toBeNull();
  expect(signal.aborted).toBe(true);
  expect(document.documentElement.style.overflow).not.toBe("hidden");
  expect(document.activeElement).toBe(trigger);
});

it("keeps a delayed preceding creator response from replacing the current creator's work", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<CreatorWorkDrawer creator={creator} onDismiss={() => {}} />));
  const previousSignal = fetchMock.mock.calls[0][1].signal;
  await act(async () => root.render(<CreatorWorkDrawer creator={{ ...creator, id: "22222222-2222-4222-8222-222222222222", name: "Studio Two" }} onDismiss={() => {}} />));
  await act(async () => resolve({ ok: true, json: async () => ({ items: [{ ...items[0], title: "Stale result" }], nextCursor: null }) }));
  expect(previousSignal.aborted).toBe(true);
  expect(container.textContent).toContain("Studio Two");
  expect(container.textContent).not.toContain("Stale result");
});

it("shows failures and retries only when requested", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => root.render(<CreatorWorkDrawer creator={creator} onDismiss={() => {}} />));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => button("Try again").click());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Blue landing page");
});

it("ends a stalled request with a retry state instead of loading forever", async () => {
  fetchMock.mockImplementation((_url, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await act(async () => root.render(<CreatorWorkDrawer creator={creator} onDismiss={() => {}} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("timed out");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(button("Try again")).toBeDefined();
});
