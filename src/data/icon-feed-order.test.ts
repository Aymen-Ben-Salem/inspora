import { expect, it } from "vitest";
import snapshot from "./icon-feed-order.json";
import { orderIconFeed } from "./icon-feed-order";

const icons = snapshot.ids.slice(0, 3).map((id) => ({ id }));

it("uses the same saved shuffle regardless of the incoming order or repeat reads", () => {
  const incoming = [icons[2], icons[0], icons[1]];
  expect(orderIconFeed(incoming)).toEqual(icons);
  expect(orderIconFeed([...incoming].reverse())).toEqual(icons);
  expect(orderIconFeed(incoming)).toEqual(icons);
});

it("keeps new icons ahead of the saved shuffle in their incoming order", () => {
  const newest = { id: "newest-icon" };
  const newer = { id: "newer-icon" };
  expect(orderIconFeed([newest, icons[2], newer, icons[0], icons[1]])).toEqual([newest, newer, ...icons]);
});

it("preserves relative order when filters return only part of the snapshot", () => {
  expect(orderIconFeed([icons[2], icons[0]])).toEqual([icons[0], icons[2]]);
  expect(orderIconFeed([])).toEqual([]);
});

it("preserves every input record and leaves the source array untouched", () => {
  const incoming = Object.freeze([icons[2], icons[0], icons[1]]);
  const result = orderIconFeed(incoming);
  expect(incoming).toEqual([icons[2], icons[0], icons[1]]);
  expect(result).toHaveLength(incoming.length);
  expect(new Set(result)).toEqual(new Set(incoming));
});
