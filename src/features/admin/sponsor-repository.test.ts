import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ requireDatabase: () => mocks }));
import { saveAdminSponsor, deleteAdminSponsor } from "./sponsor-repository";
import { sponsors } from "@/db/schema";
const row = { id: "manual", title: "Manual", url: "https://example.com", tagline: "Caption", mediaType: "video" as const,
  mediaUrl: "/media.mp4", mediaStorageProvider: "r2", mediaStorageKey: "sponsors/video.mp4", mediaPosterStorageKey: "sponsors/poster.webp",
  mediaWidth: 1200, mediaHeight: 800, mediaAlt: "", mediaVariants: [], mediaVideoPreview: {url: "/preview.mp4", storageKey: "sponsors/preview.mp4", width: 800, height: 600, bytes: 100, format: "mp4" as const},
  iconUrl: "/icon.webp", iconStorageProvider: "r2", iconStorageKey: "sponsors/icon.webp", wordmarkUrl: "/wordmark.webp", wordmarkStorageKey: "sponsors/wordmark.webp",
  isActive: false, createdAt: new Date(), updatedAt: new Date() };
function query(result: unknown[]) { return {from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(result)}; }
beforeEach(() => vi.clearAllMocks());
it("inserts only an unowned manual record and ignores a forged paid ID or ownership", async () => {
  mocks.select.mockReturnValue(query([]));
  const returning = vi.fn().mockResolvedValue([row]), values = vi.fn().mockReturnValue({returning});
  mocks.insert.mockReturnValue({values});
  const forged = {...row, mediaStorageProvider: "r2" as const, iconStorageProvider: "r2" as const, id: "paid-campaign", ownerUserId: "customer", accountId: "paid-account", campaignState: "published"};
  await saveAdminSponsor(forged, "admin");
  expect(mocks.insert.mock.calls[0][0]).toBe(sponsors);
  expect(values.mock.calls[0][0]).toMatchObject({ownerUserId: null, accountId: null, campaignState: "legacy", createdBy: "admin", wordmarkUrl: "/wordmark.webp"});
  expect(values.mock.calls[0][0]).not.toHaveProperty("id");
});
it("scopes updates to manual rows and retires replaced wordmarks", async () => {
  const lookup = query([row]); mocks.select.mockReturnValue(lookup);
  const write = {set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{...row, wordmarkUrl: "/new.webp", wordmarkStorageKey: "sponsors/new.webp"}])};
  mocks.update.mockReturnValue(write); mocks.insert.mockReturnValue({values: vi.fn()});
  const result = await saveAdminSponsor({...row, mediaStorageProvider: "r2", iconStorageProvider: "r2", wordmarkUrl: "/new.webp", wordmarkStorageKey: "sponsors/new.webp"}, "admin");
  expect(result.sponsor.wordmarkUrl).toBe("/new.webp");
  expect(result.removedManagedMedia).toEqual([{type: "image", storageProvider: "r2", storageKey: "sponsors/wordmark.webp"}]);
  const dialect = new PgDialect();
  for (const where of [lookup.where, write.where]) {
    const scope = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(scope.sql).toContain('"owner_user_id" is null'); expect(scope.sql).toContain('"account_id" is null'); expect(scope.params).toContain("legacy");
  }
});
it("includes the full wordmark and video rendition when an admin removes the manual sponsor", async () => {
  mocks.select.mockReturnValue(query([row])); const where = vi.fn(); mocks.delete.mockReturnValue({where}); mocks.insert.mockReturnValue({values: vi.fn()});
  const removed = await deleteAdminSponsor("admin");
  expect(removed).toContainEqual({type: "image", storageProvider: "r2", storageKey: "sponsors/wordmark.webp"});
  expect(removed[0].videoPreviewStorageKey).toBe("sponsors/preview.mp4");
  expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain("legacy");
});
