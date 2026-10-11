import { expect, it } from "vitest";
import { buildPlacementSequence } from "./placement-sequence";
const sponsors = ["a", "b", "c", "d"];
it("starts sponsors in the first or second desktop row and uses successive early rows with randomized columns", () => {
  const ordinaryIds = Array.from({ length: 50 }, (_, i) => String(i));
  const result = buildPlacementSequence({
    ordinaryIds,
    sponsors,
    columns: 3,
    seed: "visit1",
  });
  const positions = result.items.flatMap((item, i) =>
    item.kind === "sponsor" ? [i] : [],
  );
  const rows = positions.map((i) => Math.floor(i / 3) + 1);
  expect([1, 2]).toContain(rows[0]);
  expect(rows).toEqual(rows[0] === 1 ? [1, 2, 3, 4] : [2, 3, 4, 5]);
  expect(new Set(positions.map((i) => i % 3)).size).toBe(3);
  expect(
    result.items.filter((i) => i.kind === "ordinary").map((i) => i.id),
  ).toEqual(ordinaryIds);
  expect(
    buildPlacementSequence({ ordinaryIds, sponsors, columns: 3, seed: "other" })
      .items,
  ).not.toEqual(result.items);
});
it.each([0, 1, 2, 3])(
  "includes all campaigns once in sparse feeds with %i ordinary cards",
  (count) => {
    const result = buildPlacementSequence({
      ordinaryIds: ["0", "1", "2"].slice(0, count),
      sponsors,
      columns: 1,
      seed: "mobile",
    });
    expect(
      result.items
        .filter((i) => i.kind === "sponsor")
        .map((i) => i.id)
        .sort(),
    ).toEqual(sponsors);
  },
);
it("uses mobile ordinary gaps of two or three and preserves inserted identities/order across pagination and resize", () => {
  const ordinaryIds = Array.from({ length: 35 }, (_, i) => String(i));
  const first = buildPlacementSequence({
    ordinaryIds: ordinaryIds.slice(0, 5),
    sponsors,
    columns: 1,
    seed: "mobile",
    hasMore: true,
  });
  const next = buildPlacementSequence({
    ordinaryIds,
    sponsors,
    columns: 4,
    seed: "mobile",
    previous: first.placements,
  });
  expect(next.items.slice(0, first.items.length)).toEqual(first.items);
  expect(next.items.filter((i) => i.kind === "sponsor")).toHaveLength(4);
  const mobile = buildPlacementSequence({
    ordinaryIds,
    sponsors,
    columns: 1,
    seed: "mobile",
  });
  const gaps = mobile.placements.map(
    (p, i) => p.before - (mobile.placements[i - 1]?.before ?? 0),
  );
  expect(gaps.every((gap) => gap === 2 || gap === 3)).toBe(true);
});
