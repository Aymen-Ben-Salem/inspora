import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn(), limit: vi.fn(), offset: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ select: mocks.select }) }));
import { getSubmissionReviewQueue } from "../submissions/review-service";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin" });
  mocks.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ total: 100 }]) }) });
  mocks.select.mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => ({ limit: mocks.limit }) }) }) }) }) });
  mocks.limit.mockReturnValue({ offset: mocks.offset });
  mocks.offset.mockResolvedValue([]);
});
it("counts the review queue without loading all submissions and caps each page", async () => {
  const result = await getSubmissionReviewQueue(Number.MAX_SAFE_INTEGER);
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(24);
  expect(mocks.offset).toHaveBeenCalledExactlyOnceWith(96);
  expect(result).toEqual({ items: [], total: 100, page: 5, totalPages: 5 });
});
it("authorizes before querying private submissions", async () => {
  mocks.auth.mockRejectedValue(new Error("denied"));
  await expect(getSubmissionReviewQueue()).rejects.toThrow("denied");
  expect(mocks.select).not.toHaveBeenCalled();
});
