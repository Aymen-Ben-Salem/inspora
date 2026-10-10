// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Page from "@/app/sponsor/verify/page";

it("renders a usable verification status and native fallback before hydration", () => {
  const html = renderToString(<Page />);
  expect(html).toContain('role="status"');
  expect(html).toContain("Verifying sponsor access");
  expect(html).toContain('href="/api/sponsorship/verify"');
});

it("navigates through the browser once even when authentication rerenders the callback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const replace = vi
    .spyOn(window.location, "replace")
    .mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Page />
        </StrictMode>,
      ),
    );
    await act(async () =>
      root.render(
        <StrictMode>
          <Page />
        </StrictMode>,
      ),
    );
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/api/sponsorship/verify");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/api/sponsorship/verify",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    replace.mockRestore();
    vi.unstubAllGlobals();
  }
});
