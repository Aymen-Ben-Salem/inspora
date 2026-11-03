import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { MembersView } from "./members-view";
import type { MembersResult } from "@/features/admin/members-data";

const result: MembersResult = {
  query: { query: "Sam", filter: "joined7", sort: "newest", page: 2 },
  summary: { total: 80, joined7: 11, joined30: 19, active30: 24 },
  list: { total: 55, totalPages: 3, rows: [{ id: "fixture", name: "Sam Example", email: "sam@example.com", imageUrl: null, xUsername: "samexample", joinedAt: Date.UTC(2026, 10, 2), lastSignInAt: null }] },
};

it("renders a read-only account directory, filtered navigation and honest account activity labels", () => {
  const html = renderToStaticMarkup(<MembersView result={result} />);
  expect(html).toContain("Sam Example");
  expect(html).toContain("sam@example.com");
  expect(html).toContain('href="https://x.com/samexample"');
  expect(html).toContain("Not recorded");
  expect(html).toContain("Recent activity does not mean someone is online now.");
  expect(html).toContain("q=Sam&amp;filter=joined7&amp;page=3");
  expect(html).not.toMatch(/Export CSV|Unsubscribe|Delete|fixture/);
});

it("distinguishes provider failure from empty membership", () => {
  const failed = renderToStaticMarkup(<MembersView result={{ ...result, list: null, summary: { total: null, joined7: null, joined30: null, active30: null } }} />);
  expect(failed).toContain("Unavailable");
  expect(failed).toContain("Members couldn’t be loaded");
  expect(failed).not.toContain("No matching members");
  const empty = renderToStaticMarkup(<MembersView result={{ ...result, list: { total: 0, totalPages: 1, rows: [] } }} />);
  expect(empty).toContain("No matching members");
  expect(empty).not.toContain("temporarily unavailable");
});
