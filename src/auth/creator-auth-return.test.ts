import { describe, expect, it } from "vitest";
import { afterCreatorMatch, creatorAuthReturn } from "./creator-auth-return";

describe("creator sign-in destinations", () => {
  it("keeps an explicitly selected claim and report destination", () => {
    expect(creatorAuthReturn("/creators/example/claim")).toBe("/creators/example/claim");
    expect(creatorAuthReturn("/creators/example/claim?report=1")).toBe("/creators/example/claim?report=1");
  });
  it("checks existing X attribution after ordinary sign-in and keeps the original destination", () => {
    expect(creatorAuthReturn("/saved?filter=logos")).toBe("/profile/claim-match?returnTo=%2Fsaved%3Ffilter%3Dlogos");
    expect(afterCreatorMatch("/saved?filter=logos")).toBe("/saved?filter=logos");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/profile/claim-match", "/profile/x-callback?returnTo=/", "/sign-in"])("rejects external or looping return URLs: %s", value => {
    expect(afterCreatorMatch(value)).toBe("/");
  });
});
