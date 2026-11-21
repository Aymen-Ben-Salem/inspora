import { expect, it } from "vitest";
import { buildPlacementSequence } from "./placement-sequence";

const sponsors = ["a", "b", "c", "d"];
const ordinaryIds = Array.from({ length: 120 }, (_, index) => String(index));
function sponsorSlots(items: ReturnType<typeof buildPlacementSequence>, columns: number) {
  return items.flatMap((item, index) => item.kind === "sponsor"
    ? [[item.id, Math.floor(index / columns) + 1, index % columns + 1]]
    : []);
}

it("uses alternate rows in seat order, skips three rows, and rotates the columns on each round", () => {
  const items = buildPlacementSequence({ ordinaryIds, sponsors, columns: 4 });
  expect(sponsorSlots(items, 4).slice(0, 12)).toEqual([
    ["a", 1, 4], ["b", 3, 2], ["c", 5, 1], ["d", 7, 3],
    ["a", 11, 2], ["b", 13, 1], ["c", 15, 3], ["d", 17, 4],
    ["a", 21, 1], ["b", 23, 3], ["c", 25, 4], ["d", 27, 2],
  ]);
  expect(items.filter(item => item.kind === "ordinary").map(item => item.id)).toEqual(ordinaryIds);
});

it.each([
  [4, [4, 2, 1, 3]],
  [3, [3, 2, 1, 3]],
  [2, [2, 1, 2, 1]],
  [1, [1, 1, 1, 1]],
] as const)("repeats one sponsor every four rows at %i columns", (columns, positions) => {
  const items = buildPlacementSequence({ ordinaryIds, sponsors: ["a"], columns });
  expect(sponsorSlots(items, columns).slice(0, 4)).toEqual(
    positions.map((column, index) => ["a", index * 4 + (columns === 1 ? 3 : 1), column]),
  );
});

it("starts each repeat four rows after the last of two sponsors", () => {
  const items = buildPlacementSequence({ ordinaryIds, sponsors: ["a", "b"], columns: 4 });
  expect(sponsorSlots(items, 4).slice(0, 6)).toEqual([
    ["a", 1, 4], ["b", 3, 2], ["a", 7, 2], ["b", 9, 1], ["a", 13, 1], ["b", 15, 3],
  ]);
});

it("keeps the independent manual sponsor in the rotation after the four paid seats", () => {
  const items = buildPlacementSequence({ ordinaryIds, sponsors: [...sponsors, "manual", "a"], columns: 4 });
  expect(sponsorSlots(items, 4).slice(0, 6)).toEqual([
    ["a", 1, 4], ["b", 3, 2], ["c", 5, 1], ["d", 7, 3], ["manual", 9, 4], ["a", 13, 2],
  ]);
});

it.each([0, 1, 3])("shows each sponsor once when a complete feed has only %i ordinary cards", count => {
  const items = buildPlacementSequence({ ordinaryIds: ordinaryIds.slice(0, count), sponsors, columns: 4 });
  expect(items.filter(item => item.kind === "sponsor").map(item => item.id)).toEqual(sponsors);
});

it("does not add a repeat row after the last ordinary card", () => {
  const items = buildPlacementSequence({ ordinaryIds: ordinaryIds.slice(0, 5), sponsors: ["a"], columns: 1 });
  expect(sponsorSlots(items, 1)).toEqual([["a", 3, 1]]);
});

it("waits for the first two ordinary cards while loading a single-column feed", () => {
  const firstPage = buildPlacementSequence({ ordinaryIds: ["0"], sponsors, columns: 1, hasMore: true });
  expect(firstPage).toEqual([{ kind: "ordinary", id: "0" }]);
  const nextPage = buildPlacementSequence({ ordinaryIds: ["0", "1", "2"], sponsors, columns: 1, hasMore: true });
  expect(sponsorSlots(nextPage, 1)).toEqual([["a", 3, 1], ["b", 5, 1]]);
});

it("keeps loaded cards in place as more pages make the next sponsor slots available", () => {
  const paginated = (count: number) => buildPlacementSequence({
    ordinaryIds: ordinaryIds.slice(0, count), sponsors, columns: 4, hasMore: true,
  });
  const full = buildPlacementSequence({ ordinaryIds, sponsors, columns: 4 });
  for (const count of [2, 3, 7, 20, 32, 50]) {
    const page = paginated(count);
    expect(page).toEqual(full.slice(0, page.length));
  }
});
