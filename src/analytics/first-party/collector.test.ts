import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAnalyticsCollector } from "./collector";
import type { AcceptedEvent, DeliveryContext } from "./types";
const now = new Date("2026-10-11T12:00:00Z");
const page: DeliveryContext = {
  pageId: randomUUID(),
  path: "/",
  issuedAt: now.getTime() - 1000,
  expiresAt: now.getTime() + 60000,
  campaignId: randomUUID(),
  versionId: randomUUID(),
  placement: "feed",
};
const request = new Request("https://preview.example/api/analytics/events", {
  method: "POST",
});
function fixture() {
  const receipts = new Map<string, string>(),
    keys = new Set<string>(),
    rows: AcceptedEvent[] = [];
  const store = vi.fn(async (events: AcceptedEvent[]) => {
    const result = {
      accepted: [] as string[],
      duplicate: [] as string[],
      excluded: [] as string[],
    };
    for (const e of events) {
      const fingerprint = JSON.stringify(e);
      if (
        receipts.has(e.occurrenceId) &&
        receipts.get(e.occurrenceId) !== fingerprint
      )
        throw new Error("conflict");
      const key = [
        e.kind,
        e.pageId,
        e.campaignId,
        e.placement,
        e.milestone,
      ].join(":");
      if (
        receipts.has(e.occurrenceId) ||
        (e.kind !== "sponsor_click" && keys.has(key))
      )
        result.duplicate.push(e.occurrenceId);
      else {
        keys.add(key);
        rows.push(e);
        result.accepted.push(e.occurrenceId);
      }
      receipts.set(e.occurrenceId, fingerprint);
    }
    return result;
  });
  const decode = vi.fn(() => page);
  const visitor = vi.fn(async () => ({
      visitorKey: "2026-10:opaque",
      countryCode: null,
      device: "desktop",
      referrerDomain: null,
    }));
  const allowed = vi.fn(async () => true);
  const collector = createAnalyticsCollector({
    now: () => now,
    decode,
    visitor,
    allowed,
    store,
  });
  const event = {
    occurrenceId: randomUUID(),
    kind: "sponsor_impression",
    occurredAt: now.toISOString(),
    token: "signed",
  };
  return { collector, event, store, rows, decode, visitor, allowed };
}
it("acknowledges durable retries and duplicate impression keys without another exposure", async () => {
  const f = fixture();
  expect(await f.collector(request, { events: [f.event] })).toMatchObject({
    accepted: [f.event.occurrenceId],
  });
  expect(await f.collector(request, { events: [f.event] })).toMatchObject({
    duplicate: [f.event.occurrenceId],
  });
  await f.collector(request, {
    events: [{ ...f.event, occurrenceId: randomUUID() }],
  });
  expect(f.rows).toHaveLength(1);
  await expect(
    f.collector(request, { events: [{ ...f.event, kind: "sponsor_click" }] }),
  ).rejects.toThrow("conflict");
});
it("rejects hostile properties, old events and oversized batches before durable storage", async () => {
  const f = fixture();
  await expect(
    f.collector(request, { events: [{ ...f.event, countryCode: "US" }] }),
  ).rejects.toThrow();
  await expect(
    f.collector(request, {
      events: [{ ...f.event, occurredAt: "2026-10-11T11:44:59Z" }],
    }),
  ).rejects.toThrow();
  await expect(
    f.collector(request, { events: Array.from({ length: 21 }, () => f.event) }),
  ).rejects.toThrow();
  expect(f.store).not.toHaveBeenCalled();
});
it("never acknowledges a failed durable write as accepted", async () => {
  const f = fixture();
  f.store.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(f.collector(request, { events: [f.event] })).rejects.toThrow(
    "database unavailable",
  );
});

it("excludes legacy page views before token decoding, identity or database work", async () => {
  const f = fixture();
  const event = { ...f.event, kind: "site_page_view", token: "site-traffic-disabled" };
  expect(await f.collector(request, { events: [event] })).toEqual({
    accepted: [], duplicate: [], excluded: [event.occurrenceId],
  });
  for (const dependency of [f.decode, f.visitor, f.allowed, f.store])
    expect(dependency).not.toHaveBeenCalled();
});

it("keeps sponsor delivery when older clients include a general page view", async () => {
  const f = fixture();
  const old = { ...f.event, occurrenceId: randomUUID(), kind: "site_page_view", token: "site-traffic-disabled" };
  expect(await f.collector(request, { events: [old, f.event] })).toEqual({
    accepted: [f.event.occurrenceId], duplicate: [], excluded: [old.occurrenceId],
  });
  expect(f.rows).toHaveLength(1);
  expect(f.rows[0].kind).toBe("sponsor_impression");
  expect(f.decode).toHaveBeenCalledTimes(1);
  expect(f.visitor).toHaveBeenCalledTimes(1);
});
