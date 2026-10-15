import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), select: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ query: { creators: { findMany: mocks.find } }, select: mocks.select, execute: mocks.execute }) }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
import { getAdminCreators, getAdminCreatorOptions, getAdminCreatorDirectory } from "@/features/creators/identity/admin";
const now = new Date();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin" });
  mocks.find.mockResolvedValue([{ id: "creator-a", name: "A", avatarUrl: "/a.webp", editedFields: [], recordOrigin: "preview", createdAt: now, updatedAt: now }]);
  mocks.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
  mocks.execute.mockResolvedValue({ rows: [{ creatorId: "creator-a", workCount: 9, pendingClaimCount: 2 }] });
});
it("uses one creator read and no work-count queries for editor choices", async () => {
  const result = await getAdminCreatorOptions();
  expect(result[0]).toMatchObject({ id: "creator-a", name: "A" });
  expect(mocks.find).toHaveBeenCalledTimes(1);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
});
it("aggregates creator work and claim totals in one query without downloading each work ID", async () => {
  const result = await getAdminCreators();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(result[0]).toMatchObject({ workCount: 9, pendingClaimCount: 2 });
});

it("bounds the creator directory query and clamps excessive pages before reading creator rows", async () => {
  mocks.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve([{ total: 100 }]) }) });
  const result = await getAdminCreatorDirectory({ query: "Studio", page: Number.MAX_SAFE_INTEGER });
  expect(mocks.find.mock.calls[0][0]).toMatchObject({ limit: 24, offset: 96 });
  expect(mocks.find.mock.calls[0][0].where).toBeDefined();
  expect(result).toMatchObject({ page: 5, totalPages: 5 });
});
