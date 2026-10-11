export type SponsorPosition = { id: string; before: number };
type Item = { kind: "ordinary" | "sponsor"; id: string };
function randomFor(seed: string) {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function buildPlacementSequence(input: {
  ordinaryIds: string[];
  sponsors: string[];
  columns: number;
  seed: string;
  hasMore?: boolean;
  previous?: SponsorPosition[];
}) {
  const columns = Math.max(1, input.columns),
    random = randomFor(input.seed);
  const sponsors = [...new Set(input.sponsors)].slice(0, 4);
  const firstRow = random() < 0.5 ? 1 : 2;
  const rows = sponsors.map((_, i) => firstRow + i);
  const columnOrder = Array.from({ length: columns }, (_, i) => i);
  for (let i = columns - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [columnOrder[i], columnOrder[j]] = [columnOrder[j], columnOrder[i]];
  }
  const previous = (input.previous ?? []).filter((p) =>
    sponsors.includes(p.id),
  );
  const placements: SponsorPosition[] = [...previous];
  let mobileBefore = 0;
  sponsors.forEach((id, i) => {
    mobileBefore += random() < 0.5 ? 2 : 3;
    if (previous.some((p) => p.id === id)) return;
    const desktopBefore =
      (rows[i] - 1) * columns + columnOrder[i % columns] - i;
    let before = columns === 1 ? mobileBefore : desktopBefore;
    if (previous.length)
      before = Math.max(
        before,
        previous[previous.length - 1].before + (columns === 1 ? 2 : 1),
      );
    if (input.hasMore && before > input.ordinaryIds.length) return;
    before = Math.min(before, input.ordinaryIds.length);
    placements.push({ id, before });
  });
  placements.sort((a, b) => a.before - b.before);
  const items: Item[] = [];
  for (let i = 0; i <= input.ordinaryIds.length; i++) {
    for (const p of placements.filter((p) => p.before === i))
      items.push({ kind: "sponsor", id: p.id });
    if (i < input.ordinaryIds.length)
      items.push({ kind: "ordinary", id: input.ordinaryIds[i] });
  }
  return { items, placements };
}
