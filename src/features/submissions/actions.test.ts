import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), ensureOwnedCreator: vi.fn(), createSubmissionForOwner: vi.fn(),
  withdrawSubmissionForOwner: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/features/creators/repository", () => ({ ensureOwnedCreator: mocks.ensureOwnedCreator }));
vi.mock("./repository", () => ({
  createSubmissionForOwner: mocks.createSubmissionForOwner, readOwnSubmissionQuota: vi.fn(),
}));
vi.mock("./cleanup", () => ({ withdrawSubmissionForOwner: mocks.withdrawSubmissionForOwner }));
import { createOwnSubmission, withdrawOwnSubmission } from "./actions";

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

it("derives the withdrawal owner from Clerk instead of accepting a client owner id", async () => {
  mocks.withdrawSubmissionForOwner.mockResolvedValue({ ok: true, value: null });
  const id = "71c20e69-2070-4a62-95bc-0f3226ea790e";
  await expect(withdrawOwnSubmission(id)).resolves.toEqual({ ok: true, value: null });
  expect(mocks.withdrawSubmissionForOwner).toHaveBeenCalledWith("new-owner", id);
});
