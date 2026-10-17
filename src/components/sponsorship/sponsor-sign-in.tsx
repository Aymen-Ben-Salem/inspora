"use client";
import { SignIn } from "@clerk/nextjs";
import { publicAuthAppearance } from "@/auth/appearance";
export function SponsorSignIn() {
  return (
    <div className="w-full max-w-[429px] [&_button:enabled]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <SignIn
        routing="path"
        path="/sponsor/access"
        withSignUp
        appearance={publicAuthAppearance}
        forceRedirectUrl="/sponsor/verify"
        signUpForceRedirectUrl="/sponsor/verify"
      />
    </div>
  );
}
