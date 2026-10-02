import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), retry: vi.fn(), expired: vi.fn(), audit: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("../../db/client", () => ({ requireDatabase: () => ({ insert: () => ({ values: mocks.audit }) }) }));
vi.mock("./cleanup", () => ({ attemptCleanupJob: mocks.retry, cleanExpiredItems: mocks.expired }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { retryAdminCleanup, cleanAdminExpiredItems } from "./cleanup-admin-actions";

const initial = { ok: true, message: "" };
const id = "139b3bb0-9f59-4949-b025-ec193062079e";
function form() { const data = new FormData(); data.set("jobId", id); return data; }
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: "admin" }); mocks.retry.mockResolvedValue("completed"); });

it("denies both actions before any database or provider work", async () => {
  mocks.auth.mockRejectedValue(new Error("unauthorized"));
  await expect(retryAdminCleanup(initial, form())).rejects.toThrow("unauthorized");
  await expect(cleanAdminExpiredItems(initial, form())).rejects.toThrow("unauthorized");
  expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.expired).not.toHaveBeenCalled();
});
it("validates the selected job and audits an authorized retry", async () => {
  expect((await retryAdminCleanup(initial, new FormData())).ok).toBe(false);
  expect(mocks.retry).not.toHaveBeenCalled();
  expect((await retryAdminCleanup(initial, form())).ok).toBe(true);
  expect(mocks.retry).toHaveBeenCalledExactlyOnceWith(id);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin", action: "cleanup.retry", details: { cleanupJobId: id } }));
});
it("reports pending and failures without leaking provider errors", async () => {
  mocks.retry.mockResolvedValue("pending");
  expect((await retryAdminCleanup(initial, form())).ok).toBe(false);
  mocks.retry.mockRejectedValue(new Error("SECRET"));
  expect(JSON.stringify(await retryAdminCleanup(initial, form()))).not.toContain("SECRET");
});
it("expiry uses the separate bounded operation rather than retrying account jobs", async () => {
  mocks.expired.mockResolvedValue({ expiredSubmissions: 2, abandonedUploads: 3 });
  const result = await cleanAdminExpiredItems(initial, new FormData());
  expect(result.ok).toBe(true); expect(result.message).toContain("2 expired submissions and 3 abandoned uploads");
  expect(mocks.retry).not.toHaveBeenCalled();
  expect(mocks.expired).toHaveBeenCalledOnce();
});
