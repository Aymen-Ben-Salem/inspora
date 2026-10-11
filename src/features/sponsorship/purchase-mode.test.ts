import { expect, it } from "vitest";
import { calendarMonthEnd } from "./purchase-mode";
it.each([
  ["2027-01-31T14:15:16.123Z", "2027-02-28T14:15:16.123Z"],
  ["2028-01-31T14:15:16.123Z", "2028-02-29T14:15:16.123Z"],
  ["2026-12-15T14:15:16.123Z", "2027-01-15T14:15:16.123Z"],
])("ends a single calendar month starting %s at %s", (start, end) => {
  expect(calendarMonthEnd(Date.parse(start))).toBe(Date.parse(end));
});
