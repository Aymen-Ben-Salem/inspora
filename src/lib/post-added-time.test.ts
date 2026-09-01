import { describe, expect, it } from "vitest";

import { formatPostAddedTime } from "./post-added-time";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("formatPostAddedTime", () => {
  it("uses an hour label for posts added less than one hour ago", () => {
    expect(formatPostAddedTime("2026-09-01T11:30:00.000Z", now)).toBe(
      "less than 1h ago",
    );
  });

  it("shows whole hours throughout the first day", () => {
    expect(formatPostAddedTime("2026-09-01T02:00:00.000Z", now)).toBe(
      "10h ago",
    );
    expect(formatPostAddedTime("2026-08-31T13:00:00.000Z", now)).toBe(
      "23h ago",
    );
  });

  it("switches to whole days after 24 hours", () => {
    expect(formatPostAddedTime("2026-08-31T12:00:00.000Z", now)).toBe(
      "1 day ago",
    );
    expect(formatPostAddedTime("2026-08-29T12:00:00.000Z", now)).toBe(
      "3 days ago",
    );
  });

  it("clamps future timestamps to the newest label", () => {
    expect(formatPostAddedTime("2026-09-01T12:30:00.000Z", now)).toBe(
      "less than 1h ago",
    );
  });

  it("falls back safely for an invalid timestamp", () => {
    expect(formatPostAddedTime("not-a-date", now)).toBe("Recently added");
  });
});
