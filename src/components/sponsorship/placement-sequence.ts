type FeedItem =
  | { kind: "ordinary"; id: string }
  | { kind: "sponsor"; id: string; round: number };

export function buildPlacementSequence({
  ordinaryIds,
  sponsors,
  columns,
  hasMore = false,
}: {
  ordinaryIds: string[];
  sponsors: string[];
  columns: number;
  hasMore?: boolean;
}): FeedItem[] {
  const campaigns = [...new Set(sponsors)];
  // Start at the right edge at every width, then use the remaining columns.
  const columnOrder = [columns - 1, ...[1, 0, 2].filter(column => column < columns - 1)];
  const items: FeedItem[] = [];
  let ordinaryIndex = 0;
  let row = 0;

  for (let index = 0; campaigns.length > 0; index++) {
    const campaignIndex = index % campaigns.length;
    const round = Math.floor(index / campaigns.length);
    const column = columnOrder[(campaignIndex + round) % columnOrder.length];
    const rowStart = row * columns;
    const position = rowStart + column;
    const end = items.length + ordinaryIds.length - ordinaryIndex;

    // Strongly filtered feeds can still show each sponsor once. Repeat only
    // when the scheduled row exists and its slot can be reached.
    if (round > 0 && rowStart >= end) break;
    if (position > end && (hasMore || round > 0)) break;

    while (items.length < position && ordinaryIndex < ordinaryIds.length) {
      items.push({ kind: "ordinary", id: ordinaryIds[ordinaryIndex++] });
    }
    items.push({ kind: "sponsor", id: campaigns[campaignIndex], round });
    row += campaignIndex === campaigns.length - 1 ? 4 : 2;
  }

  for (; ordinaryIndex < ordinaryIds.length; ordinaryIndex++) {
    items.push({ kind: "ordinary", id: ordinaryIds[ordinaryIndex] });
  }
  return items;
}
