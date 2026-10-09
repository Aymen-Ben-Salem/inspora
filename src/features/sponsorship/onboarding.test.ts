import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signSponsorIntent, verifySponsorIntent } from "./onboarding";
it("rejects forged, expired and foreign owner intent without trusting a return path", () => {
  const now = 1000000,
    secret = "fixture-private-signing-key",
    token = signSponsorIntent(secret, now + 86400000, "owner-a");
  expect(verifySponsorIntent(token, secret, now, "owner-a")).toBe(true);
  expect(verifySponsorIntent(token + "x", secret, now, "owner-a")).toBe(false);
  expect(verifySponsorIntent(token, secret, now, "owner-b")).toBe(false);
  expect(verifySponsorIntent(token, secret, now + 86400000, "owner-a")).toBe(
    false,
  );
  expect(
    verifySponsorIntent(
      "sponsor=true&return=https://evil.example",
      secret,
      now,
      "owner-a",
    ),
  ).toBe(false);
});
