import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SponsorPage } from "./sponsor-page";
it("shows real capacity and exact pricing without sample audience claims or unavailable checkout", () => {
  const html = renderToStaticMarkup(<SponsorPage availability={2} enabled />);
  expect(html).toContain("2 available seats");
  expect(html).toContain("USD 500");
  expect(html).toContain("/ 30 days");
  expect(html).toContain("Automatically renews");
  expect(html).toContain("applicable tax");
  expect(html).toContain("Payment is currently unavailable");
  expect(html).not.toContain("180k");
  expect(html).not.toContain("300,000");
  const full = renderToStaticMarkup(<SponsorPage availability={0} enabled />);
  expect(full).toContain("No seats available");
  expect(full).not.toContain('href="/sponsor/start"');
  const unavailable = renderToStaticMarkup(
    <SponsorPage availability={null} enabled />,
  );
  expect(unavailable).toContain("Seat availability unavailable");
});
