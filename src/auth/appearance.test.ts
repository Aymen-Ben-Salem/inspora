import { describe, expect, it } from "vitest";

import { clerkLocalization, publicAuthAppearance } from "./appearance";

describe("Clerk email-code presentation", () => {
  it("uses Clerk's identity preview instead of a literal identifier token", () => {
    expect(clerkLocalization.signIn.emailCode.subtitle).toBe(
      "We sent a 6-digit code to",
    );
    expect(clerkLocalization.signUp.emailCode.subtitle).toBe(
      "We sent a 6-digit code to",
    );
    expect(JSON.stringify(clerkLocalization)).not.toContain("{{identifier}}");
    expect(clerkLocalization.identityPreviewEditButton__emailAddress).toBe(
      "Back",
    );
  });

  it("defines the Figma verification grid through supported Clerk elements", () => {
    const elements = publicAuthAppearance.elements;
    const verificationMain = elements.main[
      "&:has(.cl-otpCodeField)"
    ] as Record<string, string>;

    expect(verificationMain).toMatchObject({
      display: "grid",
      gridTemplateColumns: "70px 87px",
      justifyContent: "space-between",
      rowGap: "16px",
    });
    expect(
      elements.main[
        "&:has(.cl-otpCodeField) .cl-identityPreviewEditButton"
      ],
    ).toMatchObject({ gridColumn: "1", gridRow: "3", minHeight: "41px" });
    expect(
      elements.main["&:has(.cl-otpCodeField) .cl-formButtonPrimary"],
    ).toMatchObject({ gridColumn: "2", gridRow: "3", minHeight: "41px" });
    expect(
      elements.main["&:has(.cl-otpCodeField) .cl-formResendCodeLink"],
    ).toMatchObject({ gridColumn: "1 / -1", gridRow: "4" });
    expect(elements.otpCodeFieldInput).toMatchObject({
      height: "43px",
      borderRadius: "8px",
    });
  });

  it("restores the brand mark on the verification state", () => {
    expect(
      publicAuthAppearance.elements.card["&:has(.cl-otpCodeField)"],
    ).toMatchObject({
      backgroundImage: "url('/brand/inspora-auth-mark.svg')",
      backgroundPosition: "center 80px",
      backgroundSize: "56px 50px",
    });
  });
});
