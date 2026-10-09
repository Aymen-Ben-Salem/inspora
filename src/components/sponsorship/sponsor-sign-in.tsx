"use client";
import { SignIn } from "@clerk/nextjs";
import { publicAuthAppearance } from "@/auth/appearance";
export function SponsorSignIn() {
  return (
    <SignIn
      routing="path"
      path="/sponsor/access"
      withSignUp
      appearance={publicAuthAppearance}
      forceRedirectUrl="/sponsor/verify"
      signUpForceRedirectUrl="/sponsor/verify"
    />
  );
}
