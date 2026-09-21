import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runProfileCleanup: vi.fn() }));
vi.mock("@/features/submissions/cleanup", () => ({
  runProfileCleanup: mocks.runProfileCleanup,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.PROFILE_CLEANUP_SECRET = "preview-cleanup-secret";
  mocks.runProfileCleanup.mockResolvedValue({
    expiredSubmissions: 0,
    abandonedUploads: 0,
    completedJobs: 0,
    retryableFailures: 0,
  });
});

it("rejects a missing or invalid cleanup secret", async () => {
  await expect(POST(new Request("http://localhost/api/internal/profile-cleanup", {
    method: "POST",
  }))).resolves.toMatchObject({ status: 401 });
  await expect(POST(new Request("http://localhost/api/internal/profile-cleanup", {
    method: "POST",
    headers: { authorization: "Bearer wrong" },
  }))).resolves.toMatchObject({ status: 401 });
  expect(mocks.runProfileCleanup).not.toHaveBeenCalled();
});

it("runs one bounded batch with the dedicated secret", async () => {
  const response = await POST(new Request("http://localhost/api/internal/profile-cleanup?batchSize=12", {
    method: "POST",
    headers: { authorization: "Bearer preview-cleanup-secret" },
  }));
  expect(response.status).toBe(200);
  expect(mocks.runProfileCleanup).toHaveBeenCalledWith(expect.any(Date), 12);
});
