import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("../../auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("../../db/schema", () => ({}));
vi.mock("../../db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("./repository", () => ({ ensureOwnedCreator: vi.fn() }));

import {
  claimDecision,
  creatorReferenceKinds,
  existingClaimRequestResult,
  verifiedXIdentityFromAccounts,
  type ExternalAccountEvidence,
} from "./claims";

const verifiedAccount: ExternalAccountEvidence = {
  provider: "oauth_x",
  providerUserId: "x-user-42",
  username: "NeroPursue",
  verificationStatus: "verified",
};

describe("creator claims", () => {
  it("moves every creator-owned work type during claim consolidation", () => {
    expect(creatorReferenceKinds()).toEqual([
      "posts",
      "logos",
      "websites",
      "submissions",
    ]);
  });

  it("uses only server-verified X evidence", () => {
    expect(verifiedXIdentityFromAccounts([verifiedAccount])).toEqual({
      providerId: "x-user-42",
      username: "neropursue",
      profileUrl: "https://x.com/neropursue",
    });
    expect(
      verifiedXIdentityFromAccounts([
        { ...verifiedAccount, verificationStatus: "unverified" },
      ]),
    ).toBeNull();
    expect(
      verifiedXIdentityFromAccounts([
        { ...verifiedAccount, provider: "oauth_google" },
      ]),
    ).toBeNull();
  });

  it("recognizes a safe reconnect without opening another claim", () => {
    expect(
      claimDecision({
        requesterUserId: "user-1",
        currentOwnerUserId: "user-1",
        currentProviderId: "x-user-42",
        verifiedProviderId: "x-user-42",
      }),
    ).toBe("already_owned");
  });

  it("returns the existing result for duplicate and delayed claim requests", () => {
    expect(
      existingClaimRequestResult({
        id: "claim-1",
        status: "pending",
        targetCreatorId: "creator-1",
      }),
    ).toEqual({ status: "pending", claimId: "claim-1" });
    expect(
      existingClaimRequestResult({
        id: "claim-1",
        status: "approved",
        targetCreatorId: "creator-1",
      }),
    ).toEqual({ status: "claimed", creatorId: "creator-1" });
    expect(
      existingClaimRequestResult({
        id: "claim-1",
        status: "rejected",
        targetCreatorId: "creator-1",
      }),
    ).toEqual({ status: "rejected" });
  });

  it.each([
    {
      requesterUserId: "user-1",
      currentOwnerUserId: "user-2",
      currentProviderId: null,
      verifiedProviderId: "x-user-42",
    },
    {
      requesterUserId: "user-1",
      currentOwnerUserId: null,
      currentProviderId: "different-x-user",
      verifiedProviderId: "x-user-42",
    },
  ])("refuses ownership/provider conflicts", (input) => {
    expect(claimDecision(input)).toBe("conflict");
  });

  it("leaves an unowned matching creator pending for team review", () => {
    expect(
      claimDecision({
        requesterUserId: "user-1",
        currentOwnerUserId: null,
        currentProviderId: null,
        verifiedProviderId: "x-user-42",
      }),
    ).toBe("pending");
  });
});
