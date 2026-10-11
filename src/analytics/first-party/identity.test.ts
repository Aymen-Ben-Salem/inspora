import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readVisitorContext } from "./identity";
const now = new Date("2026-10-11T12:00:00Z");
it("requires trusted deployment ingress and ignores client geography and untrusted IP headers", async () => {
  const r = new Request("https://preview.example/api/analytics/events", {
    headers: {
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-ip-country": "US",
      "user-agent": "Browser",
      referer: "https://example.org/secret?email=x",
    },
  });
  const local = await readVisitorContext(r, now, {
    trusted: false,
    epoch: async () => Buffer.alloc(32, 1),
  });
  expect(local).toEqual({
    visitorKey: null,
    countryCode: null,
    device: "desktop",
    referrerDomain: "example.org",
  });
  const trusted = await readVisitorContext(
    new Request(r, {
      headers: {
        "x-vercel-forwarded-for": "1.2.3.4",
        "x-vercel-ip-country": "ZZ",
        "user-agent": "Browser",
      },
    }),
    now,
    { trusted: true, epoch: async () => Buffer.alloc(32, 1) },
  );
  expect(trusted.visitorKey).toMatch(/^2026-10:[a-f0-9]{64}$/);
  expect(trusted.countryCode).toBeNull();
  expect(JSON.stringify(trusted)).not.toMatch(/1\.2\.3\.4|Browser/);
});
it("deduplicates the same connection for a month and changes with an independently different epoch", async () => {
  const r = new Request("https://preview.example/api/analytics/events", {
    headers: {
      "x-vercel-forwarded-for": "1.2.3.4",
      "user-agent": "Browser",
      "x-vercel-ip-country": "TN",
    },
  });
  const options = { trusted: true, epoch: async () => Buffer.alloc(32, 1) };
  const first = await readVisitorContext(r, now, options);
  expect(
    await readVisitorContext(r, new Date("2026-10-12T00:00:00Z"), options),
  ).toEqual(first);
  expect(
    (
      await readVisitorContext(r, new Date("2026-11-01T00:00:00Z"), {
        ...options,
        epoch: async () => Buffer.alloc(32, 2),
      })
    ).visitorKey,
  ).not.toBe(first.visitorKey);
});
it("keeps minute-scoped ingress abuse control independent of unavailable reach identity", async () => {
  const options = {
    trusted: true,
    epoch: async () => {
      throw Error("epoch offline");
    },
    abuseSecret: Buffer.alloc(32, 3),
  };
  const request = (ip: string) =>
    new Request("https://preview.example/api/analytics/events", {
      headers: { "x-vercel-forwarded-for": ip },
    });
  const first = await readVisitorContext(request("1.2.3.4"), now, options);
  expect(first.visitorKey).toBeNull();
  expect(first.abuseKey).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (await readVisitorContext(request("1.2.3.5"), now, options)).abuseKey,
  ).not.toBe(first.abuseKey);
  expect(
    (
      await readVisitorContext(
        request("1.2.3.4"),
        new Date(now.getTime() + 60000),
        options,
      )
    ).abuseKey,
  ).not.toBe(first.abuseKey);
});
