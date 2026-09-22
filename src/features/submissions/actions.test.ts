import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), ensureCreatorForOwner: vi.fn(), createSubmissionForOwner: vi.fn(),
  withdrawSubmissionForOwner: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/features/creators/identity", () => ({ ensureCreatorForOwner: mocks.ensureCreatorForOwner }));
vi.mock("./repository", () => ({
  createSubmissionForOwner: mocks.createSubmissionForOwner, readOwnSubmissionQuota: vi.fn(),
}));
vi.mock("./cleanup", () => ({ withdrawSubmissionForOwner: mocks.withdrawSubmissionForOwner }));
import { createOwnSubmission, withdrawOwnSubmission } from "./actions";

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: "new-owner" }); });

it("initializes a first-time navbar submitter before creating their submission", async () => {
  let initialized = false;
  mocks.ensureCreatorForOwner.mockImplementation(async () => { initialized = true; });
  mocks.createSubmissionForOwner.mockImplementation(async () => ({
    ok: initialized, value: { id: "submission" },
  }));
  const result = await createOwnSubmission({
    requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e",
    kind: "website", source: "link", url: "https://example.com",
  });
  expect(result.ok).toBe(true);
  expect(mocks.ensureCreatorForOwner).toHaveBeenCalledWith({ userId: "new-owner" });
});

it("derives the withdrawal owner from Clerk instead of accepting a client owner id", async () => {
  mocks.withdrawSubmissionForOwner.mockResolvedValue({ ok: true, value: null });
  const id = "71c20e69-2070-4a62-95bc-0f3226ea790e";
  await expect(withdrawOwnSubmission(id)).resolves.toEqual({ ok: true, value: null });
  expect(mocks.withdrawSubmissionForOwner).toHaveBeenCalledWith("new-owner", id);
});

it("does not use browser ownership fields to establish creator authority", async () => {
  const input = {
    requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e", kind: "website" as const, source: "link" as const, url: "https://example.com",
    userId: "someone-else", ownerUserId: "someone-else", creatorId: "someone-else", recordOrigin: "user", owner: true,
  };
  mocks.createSubmissionForOwner.mockResolvedValue({ ok: true, value: { id: "submission" } });
  await createOwnSubmission(input);
  expect(mocks.ensureCreatorForOwner).toHaveBeenCalledWith({ userId: "new-owner" });
  expect(mocks.createSubmissionForOwner).toHaveBeenCalledWith("new-owner", {
    requestId: input.requestId, kind: "website", source: "link",
    originalUrl: "https://example.com", canonicalUrl: "https://example.com/", fingerprint: "url:https://example.com/",
  });
});

it("preserves submission errors when identity creation fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.ensureCreatorForOwner.mockRejectedValue(new Error("This account is not active."));
  await expect(createOwnSubmission({
    requestId: "71c20e69-2070-4a62-95bc-0f3226ea790e", kind: "website", source: "link", url: "https://example.com",
  })).resolves.toEqual({ ok: false, code: "unavailable", message: "The submission could not be saved. Retry with the same request." });
  expect(mocks.createSubmissionForOwner).not.toHaveBeenCalled();
  log.mockRestore();
});
