// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClaimSuccessNotice, consumeClaimSuccess, rememberClaimSuccess } from "./claim-success-notice";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("shows success once for the actual claimed profile and disappears without changing layout", async () => {
  rememberClaimSuccess("creator");
  await act(async () => root.render(<ClaimSuccessNotice creatorId="creator" workCount={2} />));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Your 2 works are now together");
  expect(container.firstElementChild?.classList.contains("fixed")).toBe(true);
  expect(consumeClaimSuccess("creator")).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(container.textContent).toBe("");
  await act(async () => root.render(<ClaimSuccessNotice key="revisit" creatorId="creator" workCount={2} />));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.textContent).toBe("");
});
it("pauses dismissal while the user focuses its close control", async () => {
  rememberClaimSuccess("creator");
  await act(async () => root.render(<ClaimSuccessNotice creatorId="creator" workCount={1} />));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => container.querySelector("button")!.focus());
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toBe("");
});
it("ignores stale receipts and receipts for another profile", () => {
  rememberClaimSuccess("other"); expect(consumeClaimSuccess("creator")).toBe(false);
  rememberClaimSuccess("creator"); vi.advanceTimersByTime(61000); expect(consumeClaimSuccess("creator")).toBe(false);
});
