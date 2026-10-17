import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SponsorPage } from "./sponsor-page";
it("links to sponsorship policy and returning access without sample audience claims or unavailable checkout", () => {
  const html = renderToStaticMarkup(<SponsorPage availability={2} enabled />);
  expect(html).toContain("2 available spots");
  expect(html).toContain("500$");
  expect(html).toContain("€500 for one month in euro billing.");
  expect(html).toContain("choose Monthly for automatic renewal until cancelled.");
  expect(html).toContain('href="/info#sponsorship"');
  expect(html.match(/href="\/api\/sponsorship\/intent"/g)).toHaveLength(2);
  expect(html).not.toContain("180k");
  expect(html).not.toContain("300,000");
  const full = renderToStaticMarkup(<SponsorPage availability={0} enabled />);
  expect(full).toContain("No seats available");
  expect(full).not.toContain('href="/sponsor/start"');
  expect(full).toContain('href="/info#sponsorship"');
  expect(full).toContain('href="/api/sponsorship/intent"');
  const unavailable = renderToStaticMarkup(
    <SponsorPage availability={null} enabled />,
  );
  expect(unavailable).toContain("Seat availability unavailable");
});
