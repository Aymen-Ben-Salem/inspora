import { beforeEach, expect, it, vi } from "vitest";
import { cacheLife, cacheTag } from "next/cache";
import { getDatabase } from "@/db/client";
import { getPublishedWebsites } from "../websites-repository";
import { incompletePresentations } from "./testing/completeness";
import { websiteFixture } from "./testing/fixtures";
import { readWorkPage } from "./index";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(), requireDatabase: vi.fn(() => {
  const database = getDatabase();
  if (!database) throw new Error("DATABASE_URL is not configured.");
  return database;
}) }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2026-09-01T00:00:00Z") }));
const request = { scope: { kind: "website-archive" }, order: "publication-desc" } as const;
const findMany = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue({ query: { websites: { findMany } } } as unknown as NonNullable<ReturnType<typeof getDatabase>>);
  findMany.mockResolvedValue([websiteFixture()]);
});
it("returns usable archive cards and complete-array continuation", async () => {
  const result = await readWorkPage(request);
  expect(result.nextCursor).toBeNull();
  expect(result.items).toMatchObject([{ slug: "paper", recording: { posterUrl: "/poster.webp" }, sections: [{ url: "/hero.webp" }] }]);
  expect(await getPublishedWebsites()).toEqual(result.items);
});
it("fails the whole read when a selected presentation becomes inconsistent", async () => {
  const incomplete = websiteFixture();
  incomplete.sections = [];
  findMany.mockResolvedValue([websiteFixture(), incomplete]);
  await expect(readWorkPage(request)).rejects.toThrow(/incomplete/);
  await expect(getPublishedWebsites()).rejects.toThrow(/incomplete/);
});
it("owns work and creator cache dependencies with the existing lifetime", async () => {
  await getPublishedWebsites();
  expect(cacheLife).toHaveBeenCalledExactlyOnceWith({ stale: 300, revalidate: 21600, expire: 604800 });
  expect(cacheTag).toHaveBeenCalledWith("published-websites", "public-creator-profiles");
});
it("only the adapter falls back for explicit no-database configuration", async () => {
  vi.mocked(getDatabase).mockReturnValue(null);
  expect(await getPublishedWebsites()).toEqual([]);
  await expect(readWorkPage(request)).rejects.toThrow(/not configured/);
});
it("propagates configuration and query failures", async () => {
  findMany.mockRejectedValueOnce(new Error("query failed"));
  await expect(getPublishedWebsites()).rejects.toThrow("query failed");
  vi.mocked(getDatabase).mockImplementationOnce(() => { throw new Error("wrong environment"); });
  await expect(getPublishedWebsites()).rejects.toThrow("wrong environment");
});
it.each([
  { ...request, scope: { kind: "creator", creatorId: "other" } },
  { ...request, order: "created-desc" },
  { ...request, filters: { category: "Web" } },
  { ...request, filters: { view: "unknown" } },
  { ...request, cursor: "legacy-or-malformed" },
  { ...request, limit: 16 },
])("rejects unsupported requests before selection: %j", async (invalid) => {
  await expect(readWorkPage(invalid as typeof request)).rejects.toThrow(/Unsupported/);
  expect(findMany).not.toHaveBeenCalled();
});

it("does not truncate a complete archive to a browser page", async () => {
  findMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({ ...websiteFixture(), id: String(i) })));
  expect((await getPublishedWebsites()).length).toBe(40);
});
it("propagates mapper errors instead of returning partial cards", async () => {
  const row = websiteFixture();
  row.media.push({ ...row.media[1], role: "unsupported" });
  findMany.mockResolvedValue([row]);
  await expect(readWorkPage(request)).rejects.toThrow("Unsupported website media role");
});

it.each(incompletePresentations)("fails selected incomplete presentation: $name", async ({ change }) => {
  const row = websiteFixture();
  change(row);
  findMany.mockResolvedValue([row]);
  await expect(readWorkPage(request)).rejects.toThrow(/incomplete/);
});
it.each([null, new Date("2026-09-01T00:00:00.001Z")])("fails inconsistent selected publication time %s", async publishedAt => {
  findMany.mockResolvedValue([{ ...websiteFixture(), publishedAt }]);
  await expect(readWorkPage(request)).rejects.toThrow(/inconsistent/);
});
it.each([false, 0, "", {}])("does not impose preview shape validation: %j", async preview => {
  const row = websiteFixture();
  row.media[0].videoPreview = preview as unknown as NonNullable<typeof row.media[0]["videoPreview"]>;
  findMany.mockResolvedValue([row]);
  expect((await readWorkPage(request)).items[0].recording.videoPreview).toEqual(preview);
});
