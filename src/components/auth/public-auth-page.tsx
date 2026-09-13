import "server-only";

import { SignIn, SignUp } from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";

import { publicAuthAppearance } from "../../auth/appearance";
import { isClerkConfigured } from "../../auth/config";
import { BrandMark } from "../brand-mark";

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
}: {
  flow: AuthFlow;
  backdrop?: ReactNode;
}) {
  const label = flowLabels[flow];

  return (
    <div className="relative isolate min-h-[100dvh] overflow-hidden bg-white text-[#262626]">
      <div
        aria-hidden="true"
        inert
        data-auth-backdrop
        className="pointer-events-none absolute inset-[-8px] select-none overflow-hidden blur-[5px]"
      >
        {backdrop ?? <div className="min-h-[calc(100dvh+16px)] bg-[#fafafa]" />}
      </div>

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="w-full max-w-[429px]"
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
                <SignIn appearance={publicAuthAppearance} />
              ) : (
                <SignUp appearance={publicAuthAppearance} />
              )}
            </Suspense>
          ) : (
            <UnconfiguredAuthCard />
          )}
        </section>
      </div>
    </div>
  );
}
