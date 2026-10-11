import { describe, expect, it } from "vitest";
import { accountCapabilities } from "./capabilities";
describe("server-owned capabilities", () => {
  it("gives sponsors ordinary account features before and after paid access expires", () => {
    expect(
      accountCapabilities({
        profile: null,
        identity: "allowed",
        account: null,
      }),
    ).toEqual({ viewer: true, sponsor: true, sponsorReadonly: false });
    expect(
      accountCapabilities({
        profile: null,
        identity: "allowed",
        account: "inactive",
      }),
    ).toEqual({ viewer: true, sponsor: true, sponsorReadonly: true });
  });
  it("does not reactivate a suspended or deleting ordinary profile through sponsorship", () => {
    for (const profile of ["suspended", "deleting", "deleted"]) {
      expect(
        accountCapabilities({ profile, identity: "allowed", account: "active" })
          .viewer,
      ).toBe(false);
    }
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
    expect(
      accountCapabilities({
        profile: null,
        identity: "revoked",
        account: "active",
      }).viewer,
    ).toBe(true);
  });
});
