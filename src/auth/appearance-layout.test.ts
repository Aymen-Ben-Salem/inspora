import { describe, expect, it } from "vitest";

import { clerkLocalization, publicAuthAppearance } from "./appearance";

describe("Clerk auth card presentation", () => {
  it("uses Clerk's identity preview instead of a literal identifier token", () => {
    expect(clerkLocalization.signIn.emailCode.subtitle).toBe(
      "We sent a 6-digit code to",
    );
    expect(clerkLocalization.signUp.emailCode.subtitle).toBe(
      "We sent a 6-digit code to",
    );
    expect(JSON.stringify(clerkLocalization)).not.toContain("{{identifier}}");
  });

  it("makes individual OTP slots square without making the whole row square", () => {
    const elements = publicAuthAppearance.elements;
    expect(elements.otpCodeFieldInputContainer).toEqual({ width: "100%", minWidth: 0 });
    expect(elements.otpCodeFieldInputs).toMatchObject({
      display: "grid",
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      gap: "8px",
    });
    expect(elements.otpCodeFieldInput).toMatchObject({
      width: "100%",
      height: "auto",
      aspectRatio: "1 / 1",
      borderRadius: "8px",
    });
  });

  it("stacks the main-screen providers and gives both cards a subtle shadow", () => {
    const elements = publicAuthAppearance.elements;

    expect(clerkLocalization.socialButtonsBlockButton).toBe(
      "Continue with {{provider|titleize}}",
    );
    expect(elements.socialButtons).toMatchObject({
      display: "flex",
      flexDirection: "column",
      gap: "16px",
    });
    expect(elements.lastAuthenticationStrategyBadge).toEqual({ display: "none" });
    expect(elements.cardBox.boxShadow).toBe(
      "0 4px 18px rgba(38, 38, 38, 0.06), 0 1px 3px rgba(38, 38, 38, 0.05)",
    );
  });
});
