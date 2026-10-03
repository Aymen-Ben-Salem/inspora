import { expect, expectTypeOf, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { creators } from "@/db/schema";
import type {
  AdminCreatorAttribution,
  AdminCreatorRecord,
} from "./types";
import {
  mapAdminCreatorAttribution,
  mapAdminCreatorRecord,
  mapPublicCreatorProfile,
  mapCreatorSummary,
} from "./identity/projections";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Studio One",
  handle: "@studio-one",
  username: "studio_one",
  url: "https://studio.example",
  xProfileUrl: "https://x.com/studio_one",
  xProviderId: null,
  ownerUserId: null,
  editedFields: [],
  recordOrigin: "preview",
  avatarUrl: "/avatar.svg",
  avatarStorageProvider: null,
  avatarStorageKey: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
} as typeof creators.$inferSelect;

it.each([mapPublicCreatorProfile, mapCreatorSummary])("separates legacy X links from creator websites", (map) => {
  expect(map({ ...row, url: "https://twitter.com/studio_one", xProfileUrl: null }))
    .toMatchObject({ websiteUrl: null, xProfileUrl: "https://x.com/studio_one" });
  expect(map({ ...row, url: row.xProfileUrl }))
    .toMatchObject({ websiteUrl: null, xProfileUrl: row.xProfileUrl });
  expect(map(row)).toMatchObject({ websiteUrl: row.url, xProfileUrl: row.xProfileUrl });
  expect(map({ ...row, xProfileUrl: null })).toMatchObject({ websiteUrl: row.url, xProfileUrl: null });
  expect(map({ ...row, url: null, xProfileUrl: null })).toMatchObject({ websiteUrl: null, xProfileUrl: null });
});

it("keeps unmeasured totals out of embedded creator attribution", () => {
  const attribution = mapAdminCreatorAttribution(row);

  expect(attribution).not.toHaveProperty("workCount");
  expect(attribution).not.toHaveProperty("pendingClaimCount");
  expect(attribution).not.toHaveProperty("handle");
  expect(attribution).toMatchObject({
    id: row.id,
    name: "Studio One",
    username: "studio_one",
    legacyHandle: "@studio-one",
    recordOrigin: "preview",
  });
  expectTypeOf(attribution).toEqualTypeOf<AdminCreatorAttribution>();
});

it("maps only measured totals onto aggregate admin creator records", () => {
  const record = mapAdminCreatorRecord(row, {
    workCount: 7,
    pendingClaimCount: 2,
  });

  expect(record).toMatchObject({ workCount: 7, pendingClaimCount: 2 });
  expectTypeOf(record).toEqualTypeOf<AdminCreatorRecord>();
});
