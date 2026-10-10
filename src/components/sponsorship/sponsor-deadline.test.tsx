// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SponsorDeadline } from "./sponsor-deadline";
afterEach(() => vi.useRealTimers());
it("hides at a 30-day deadline even when that exceeds the timer maximum", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement("div"),
    root = createRoot(node);
  await act(async () =>
    root.render(
      <SponsorDeadline
        serverTime="2026-10-10T12:00:00Z"
        paidThrough="2026-11-09T12:00:00Z"
      >
        <span>Paid promotion</span>
      </SponsorDeadline>,
    ),
  );
  expect(node.textContent).toBe("Paid promotion");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30 * 86400000);
  });
  expect(node.textContent).toBe("");
  await act(async () => root.unmount());
});
