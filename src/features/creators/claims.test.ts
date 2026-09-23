import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("./identity/claim-approval", () => ({ approveCreatorOwnershipClaim: vi.fn() }));

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { approveCreatorOwnershipClaim } from "./identity/claim-approval";
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


describe("committed review cache refresh timing", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin" });
  });

  it("refreshes an approved claim before returning to the action, only after commit", async () => {
    let finishApproval!: (outcome: Awaited<ReturnType<typeof approveCreatorOwnershipClaim>>) => void;
    vi.mocked(approveCreatorOwnershipClaim).mockImplementationOnce(() => new Promise((resolve) => {
      finishApproval = resolve;
    }));
    const review = reviewCreatorOwnershipClaim("claim-id", "approve");
    await vi.waitFor(() => expect(approveCreatorOwnershipClaim).toHaveBeenCalled());
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    finishApproval({ result: { status: "claimed", creatorId: "target" }, identityChanged: true });
    await expect(review).resolves.toEqual({ status: "claimed", creatorId: "target" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/creators");
    expect(revalidatePath).toHaveBeenCalledWith("/creators/[username]", "page");
    expect(revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledTimes(4);
    expect(after).not.toHaveBeenCalled();
  });

  it("does not invalidate a replayed review", async () => {
    vi.mocked(approveCreatorOwnershipClaim).mockResolvedValueOnce({
      result: { status: "claimed", creatorId: "target" }, identityChanged: false,
    });
    await expect(reviewCreatorOwnershipClaim("claim-id", "approve")).resolves.toEqual({ status: "claimed", creatorId: "target" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("does not invalidate a failed review", async () => {
    vi.mocked(approveCreatorOwnershipClaim).mockRejectedValueOnce(new Error("Transaction rolled back"));
    await expect(reviewCreatorOwnershipClaim("claim-id", "approve")).rejects.toThrow("Transaction rolled back");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
});
