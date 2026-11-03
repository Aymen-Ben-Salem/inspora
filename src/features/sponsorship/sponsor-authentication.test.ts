import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const adapters = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: adapters.auth,
  clerkClient: async () => ({ users: { getUser: adapters.user } }),
}));
vi.mock("@/auth/config", () => ({ isClerkConfigured: () => true }));
vi.mock("./config", () => ({
  sponsorshipEnabled: () => true,
  sponsorshipWritesEnabled: () => true,
}));
vi.mock("./repository", () => ({
  readIdentityCapabilities: adapters.identity,
  bindSponsorIdentity: vi.fn(),
  readSponsorAccountForOwner: vi.fn(),
}));
vi.mock("./onboarding", () => ({ hasSponsorIntent: async () => false }));
import { verifiedSponsorOwner } from "./authorization";
beforeEach(() => {
  vi.resetAllMocks();
  adapters.auth.mockResolvedValue({
    userId: "owner",
    sessionClaims: { fva: [0, 0] },
  });
  adapters.user.mockResolvedValue({
    primaryEmailAddress: { verification: { status: "verified" } },
    totpEnabled: true,
  });
  adapters.identity.mockResolvedValue({
    profile: null,
    identity: "allowed",
    account: "active",
  });
});
it("allows a verified-email sponsor without mandatory authenticator enrollment", async () => {
  adapters.user.mockResolvedValue({
    primaryEmailAddress: { verification: { status: "verified" } },
    totpEnabled: false,
    twoFactorEnabled: false,
  });
  adapters.auth.mockResolvedValue({ userId: "owner", sessionClaims: { fva: [0, -1] } });
  expect(await verifiedSponsorOwner()).toBe("owner");
});
it.each([undefined, [-1, -1], [0, -1], [0], [0, "0"], [0, NaN]])(
  "rejects missing or unverified second-factor session evidence: %j",
  async (fva) => {
    adapters.auth.mockResolvedValue({
      userId: "owner",
      sessionClaims: { fva },
    });
    expect(await verifiedSponsorOwner("write")).toBeNull();
    expect(adapters.identity).not.toHaveBeenCalled();
  },
);
it("accepts an enrolled authenticator and a verified second factor in this session", async () => {
  expect(await verifiedSponsorOwner("write")).toBe("owner");
});
it("still rejects unverified email when MFA enrollment is optional", async () => {
  adapters.user.mockResolvedValue({ primaryEmailAddress: { verification: { status: "unverified" } }, totpEnabled: false });
  expect(await verifiedSponsorOwner()).toBeNull();
  expect(adapters.identity).not.toHaveBeenCalled();
});
it("still denies a revoked sponsor after successful MFA", async () => {
  adapters.identity.mockResolvedValue({
    profile: "active",
    identity: "revoked",
    account: "active",
  });
  expect(await verifiedSponsorOwner()).toBeNull();
});
