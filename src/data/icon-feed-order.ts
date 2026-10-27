import snapshot from "./icon-feed-order.json";

const positions = new Map(snapshot.ids.map((id, index) => [id, index]));

// A fixed shuffle of the icons published on 2026-10-27. New icons retain their
// incoming newest-first order ahead of this snapshot; no visit reshuffles it.
export function orderIconFeed<Item extends { id: string }>(icons: readonly Item[]): Item[] {
  return [...icons].sort((left, right) =>
    (positions.get(left.id) ?? -1) - (positions.get(right.id) ?? -1),
  );
}
