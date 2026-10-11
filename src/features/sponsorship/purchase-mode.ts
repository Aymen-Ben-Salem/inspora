export type SponsorBillingMode = "one_time" | "subscription";

export function isSponsorBillingMode(value: unknown): value is SponsorBillingMode {
  return value === "one_time" || value === "subscription";
}

export function calendarMonthEnd(start: number): number {
  if (!Number.isFinite(start)) throw new Error("A valid payment time is required.");
  const date = new Date(start);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)).getUTCDate();
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1,
    Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(),
    date.getUTCSeconds(), date.getUTCMilliseconds());
}
