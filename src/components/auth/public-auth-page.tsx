import "server-only";

import { SignUp } from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";

import { publicAuthAppearance } from "../../auth/appearance";
import { isClerkConfigured } from "../../auth/config";
import { AuthModalShell } from "./auth-modal-shell";
import { BrandMark } from "../brand-mark";
import { PublicSignIn } from "./public-sign-in";

type AuthFlow = "sign-in" | "sign-up";

const flowLabels = {
  "sign-in": "Sign in to Inspora",
  "sign-up": "Join Inspora",
} satisfies Record<AuthFlow, string>;

function UnconfiguredAuthCard() {
  return (
    <div className="w-full bg-white px-10 py-20 text-center">
      <div className="mx-auto flex h-[50px] w-14 items-center justify-center text-black">
        <BrandMark />
      </div>
      <h1 className="mt-4 text-2xl font-medium tracking-[-0.48px] text-[#444]">
        Join Inspora
      </h1>
      <p className="mt-10 text-sm leading-relaxed text-[#787878]">
        Authentication is not available yet. Please continue browsing Inspora.
      </p>
    </div>
  );
}

export function PublicAuthPage({
  flow,
  backdrop,
  overlay = false,
  redirectUrl = "/",
}: {
  flow: AuthFlow;
  backdrop?: ReactNode;
  overlay?: boolean;
  redirectUrl?: string;
}) {
  const label = flowLabels[flow];

  return (
    <AuthModalShell
      label={label}
      overlay={overlay}
      backdrop={
        backdrop ?? <div className="min-h-[calc(100dvh+16px)] bg-[#fafafa]" />
      }
    >
      {isClerkConfigured() ? (
        <Suspense
          fallback={
            <div
              aria-label={`Loading ${label.toLowerCase()}`}
              className="min-h-[493px] w-full bg-white"
            />
          }
        >
          {flow === "sign-in" ? (
            <PublicSignIn redirectUrl={redirectUrl} />
          ) : (
            <SignUp
              routing="path"
              path="/sign-up"
              appearance={publicAuthAppearance}
              forceRedirectUrl={redirectUrl}
            />
          )}
        </Suspense>
      ) : (
        <UnconfiguredAuthCard />
      )}
    </AuthModalShell>
  );
}
