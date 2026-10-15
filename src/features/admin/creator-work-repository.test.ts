import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ execute: mocks.execute }) }));
import { getAdminCreatorWorkPage } from "./creator-work-repository";

const creatorId = "11111111-1111-4111-8111-111111111111";
const otherCreator = "22222222-2222-4222-8222-222222222222";
function row(index: number, kind = "design", status = "published") {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, kind, status, title: `Work ${index}`,
    createdAt: "2026-10-15T12:00:00.000123Z", previewUrl: "/original.webp", previewAlt: "Work preview",
    variants: [{ url: "/640.webp", width: 640, height: 480, bytes: 100, storageKey: "640.webp", format: "webp" }],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin" });
  mocks.execute.mockResolvedValue({ rows: [] });
});

it("authorizes the caller before reading private creator work", async () => {
  mocks.auth.mockRejectedValue(new Error("denied"));
  await expect(getAdminCreatorWorkPage({ creatorId })).rejects.toThrow("denied");
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("reads all work kinds and statuses in one creator-scoped query with a bounded lookahead", async () => {
  mocks.execute.mockResolvedValue({ rows: [row(1), row(2, "logo", "draft"), row(3, "app-icon", "archived"), row(4, "website")] });
  const result = await getAdminCreatorWorkPage({ creatorId, query: "  50%_test  " });
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  const { sql, params } = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
  expect(sql).toContain("union all");
  expect(sql).toContain('"posts"."creator_id"');
  expect(sql).toContain('"logos"."creator_id"');
  expect(sql).toContain('"websites"."creator_id"');
  expect(params).toContain(creatorId);
  expect(params).toContain("%50\\%\\_test%");
  expect(params).toContain(25);
  expect(result.items.map((item) => item.kind)).toEqual(["design", "logo", "app-icon", "website"]);
  expect(result.items.map((item) => item.status)).toEqual(["published", "draft", "archived", "published"]);
  expect(result.items[0].thumbnailUrl).toBe("/640.webp");
  expect(result.nextCursor).toBeNull();
});

it("carries microsecond timestamps into a stable next-page cursor", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: Array.from({ length: 25 }, (_, index) => row(index + 1)) });
  const result = await getAdminCreatorWorkPage({ creatorId });
  expect(result.items).toHaveLength(24);
  expect(result.nextCursor).toBeTruthy();
  await getAdminCreatorWorkPage({ creatorId, cursor: result.nextCursor });
  const { sql, params } = new PgDialect().sqlToQuery(mocks.execute.mock.calls[1][0]);
  expect(sql).toContain("(created_at, kind_rank, id) <");
  expect(sql).toContain("order by created_at desc, kind_rank desc, id desc");
  expect(params).toContain("2026-10-15T12:00:00.000123Z");
  expect(params).toContain(row(24).id);
});

it("rejects invalid input and cursors reused for another creator or search before querying", async () => {
  await expect(getAdminCreatorWorkPage({ creatorId: "invalid" })).rejects.toThrow(/Invalid/);
  await expect(getAdminCreatorWorkPage({ creatorId, cursor: "invalid" })).rejects.toThrow(/Invalid/);
  expect(mocks.execute).not.toHaveBeenCalled();
  mocks.execute.mockResolvedValueOnce({ rows: Array.from({ length: 25 }, (_, index) => row(index + 1)) });
  const result = await getAdminCreatorWorkPage({ creatorId });
  mocks.execute.mockClear();
  await expect(getAdminCreatorWorkPage({ creatorId: otherCreator, cursor: result.nextCursor })).rejects.toThrow(/Invalid/);
  await expect(getAdminCreatorWorkPage({ creatorId, query: "different", cursor: result.nextCursor })).rejects.toThrow(/Invalid/);
  expect(mocks.execute).not.toHaveBeenCalled();
});
