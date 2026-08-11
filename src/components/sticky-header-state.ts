const TOP_REVEAL_THRESHOLD = 104;
const DIRECTION_CHANGE_THRESHOLD = 4;

export function resolveSecondaryHeaderVisibility({
  currentScrollY,
  previousScrollY,
  visible,
}: {
  currentScrollY: number;
  previousScrollY: number;
  visible: boolean;
}) {
  if (currentScrollY <= TOP_REVEAL_THRESHOLD) return true;

  const delta = currentScrollY - previousScrollY;
  if (Math.abs(delta) < DIRECTION_CHANGE_THRESHOLD) return visible;

  return delta < 0;
}
