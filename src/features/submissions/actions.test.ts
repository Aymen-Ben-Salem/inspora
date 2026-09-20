import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), ensureOwnedCreator: vi.fn(), createSubmissionForOwner: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/features/creators/repository", () => ({ ensureOwnedCreator: mocks.ensureOwnedCreator }));
vi.mock("./repository", () => ({
  createSubmissionForOwner: mocks.createSubmissionForOwner, readOwnSubmissionQuota: vi.fn(),
}));
import { createOwnSubmission } from "./actions";

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: "new-owner" }); });

it("initializes a first-time navbar submitter before creating their submission", async () => {
  let initialized = false;
  mocks.ensureOwnedCreator.mockImplementation(async () => { initialized = true; });
  mocks.createSubmissionForOwner.mockImplementation(async () => ({
    ok: initialized, value: { id: "submission" },
  }));
  const result = await createOwnSubmission({
    requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
    kind: "website", source: "link", url: "https://example.com",
  });
  expect(result.ok).toBe(true);
  expect(mocks.ensureOwnedCreator).toHaveBeenCalledWith("new-owner");
});
