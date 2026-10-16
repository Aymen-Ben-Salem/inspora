import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

it("keeps UTC chart dates when the administrator is west of UTC", async () => {
  const DateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
    return new DateTimeFormat(locales, { timeZone: "America/Los_Angeles", ...options });
  });
  vi.resetModules();
  const { TrafficChart } = await import("./analytics-tabs");
  const html = renderToStaticMarkup(<TrafficChart range="today" daily={[
    { date: "2026-10-16", pageviews: 2, uniqueVisitors: 1, postOpens: 0 },
  ]} />);
  expect(html).toContain("Oct 16: 1 unique visitors");
  expect(html).not.toContain("Oct 15");
});
