const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

export function formatPostAddedTime(
  addedAt: string,
  now: Date = new Date(),
): string {
  const addedAtMs = Date.parse(addedAt);
  const nowMs = now.getTime();

  if (!Number.isFinite(addedAtMs) || !Number.isFinite(nowMs)) {
    return "Recently added";
  }

  const elapsedMs = Math.max(0, nowMs - addedAtMs);
  const elapsedHours = Math.floor(elapsedMs / HOUR_IN_MS);

  if (elapsedHours < 1) {
    return "less than 1h ago";
  }

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedMs / DAY_IN_MS);
  return elapsedDays === 1 ? "1 day ago" : `${elapsedDays} days ago`;
}
