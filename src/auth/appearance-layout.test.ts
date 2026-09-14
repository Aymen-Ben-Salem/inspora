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

  it("keeps Clerk's form box intact and positions verification actions safely", () => {
    const elements = publicAuthAppearance.elements;
    const verificationMain = elements.main[
      "&:has(.cl-otpCodeField)"
    ] as Record<string, string | number>;

    expect(verificationMain).toMatchObject({ gap: 0, position: "static" });
    expect(elements.main["&:has(.cl-otpCodeField) .cl-form"]).toMatchObject({
      position: "static",
      gap: "16px",
    });
    expect(
      elements.main["&:has(.cl-otpCodeField) .cl-formButtonPrimary"],
    ).toMatchObject({
      position: "absolute",
      top: "338px",
      right: "40px",
      width: "87px",
    });
    expect(
      elements.main["&:has(.cl-otpCodeField) .cl-formResendCodeLink"],
    ).toMatchObject({ position: "absolute", top: "397px" });
    expect(elements.identityPreviewEditButton).toMatchObject({
      position: "absolute",
      top: "338px",
      left: "40px",
      width: "70px",
    });
    expect(JSON.stringify(elements.main)).not.toContain('"display":"contents"');
  });

  it("matches the Figma verification card dimensions", () => {
    const verificationCard = publicAuthAppearance.elements.card[
      "&:has(.cl-otpCodeField)"
    ];

    expect(verificationCard).toMatchObject({
      height: "auto",
      minHeight: "489px",
      backgroundImage: "url('/brand/inspora-auth-mark.svg')",
      backgroundPosition: "center 80px",
      backgroundSize: "56px 50px",
      paddingTop: "135px",
    });
    expect(publicAuthAppearance.elements.otpCodeFieldInputs).toMatchObject({
      display: "grid",
      width: "100%",
      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
      gap: "8px",
    });
    expect(
      publicAuthAppearance.elements.otpCodeFieldInputContainer,
    ).toMatchObject({
      width: "100%",
      minWidth: 0,
      aspectRatio: "1 / 1",
    });
    expect(publicAuthAppearance.elements.otpCodeFieldInput).toMatchObject({
      width: "100%",
      height: "100%",
      minWidth: 0,
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
