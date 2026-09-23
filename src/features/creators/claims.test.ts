import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { requireAdmin } from "@/auth/require-admin";
import { withWriteTransaction } from "@/db/write-client";
import { requestCreatorOwnershipClaimFromVerifiedX, reviewCreatorOwnershipClaim } from "./identity";

beforeEach(() => { vi.clearAllMocks(); });

describe("ownership claim authority and review validation", () => {
  it("refuses an empty owner principal before provider retrieval or writes", async () => {
    await expect(requestCreatorOwnershipClaimFromVerifiedX({ userId: " " })).rejects.toThrow("Sign in");
    expect(withWriteTransaction).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject"] as const)("requires server-established admin authority for %s", async (decision) => {
    const denied = new Error("NEXT_REDIRECT");
    vi.mocked(requireAdmin).mockRejectedValueOnce(denied);
    await expect(reviewCreatorOwnershipClaim("claim-id", decision, "Reason")).rejects.toBe(denied);
    expect(withWriteTransaction).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])("requires a nonempty trimmed rejection reason (%s)", async (reason) => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin" });
    await expect(reviewCreatorOwnershipClaim("claim-id", "reject", reason)).rejects.toThrow("Add a reason before rejecting this claim.");
    expect(withWriteTransaction).not.toHaveBeenCalled();
  });
});
