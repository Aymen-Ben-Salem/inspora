import { describe, expect, it } from "vitest";
import { accountCapabilities } from "./capabilities";
describe("server-owned capabilities", () => {
  it("keeps sponsor-only identity separate after preparation expiry and navigation away", () => {
    expect(
      accountCapabilities({
        profile: null,
        identity: "allowed",
        account: null,
      }),
    ).toEqual({ viewer: false, sponsor: true, sponsorReadonly: false });
    expect(
      accountCapabilities({
        profile: null,
        identity: "allowed",
        account: "inactive",
      }),
    ).toEqual({ viewer: false, sponsor: true, sponsorReadonly: true });
  });
  it("retains ordinary and dual-capability behavior and denies revoked sponsor access", () => {
    expect(
      accountCapabilities({ profile: "active", identity: null, account: null })
        .viewer,
    ).toBe(true);
    expect(
      accountCapabilities({
        profile: "active",
        identity: "allowed",
        account: "active",
      }),
    ).toEqual({ viewer: true, sponsor: true, sponsorReadonly: false });
    expect(
      accountCapabilities({
        profile: "active",
        identity: "revoked",
        account: "active",
      }).sponsor,
    ).toBe(false);
  });
});
