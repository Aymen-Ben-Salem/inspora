import "server-only";

import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { isClerkConfigured } from "../../auth/config";
import { BrandMark } from "../brand-mark";

type AuthFlow = "sign-in" | "sign-up";

const flowContent = {
  "sign-in": {
    heading: "Welcome back.",
    description: "Sign in to your Inspora account.",
    formLabel: "Sign in",
  },
  "sign-up": {
    heading: "Join Inspora.",
    description: "Create your Inspora account.",
    formLabel: "Sign up",
  },
} satisfies Record<
  AuthFlow,
  { heading: string; description: string; formLabel: string }
>;

function AuthShell({
  heading,
  description,
  formLabel,
  children,
}: {
  heading: string;
  description: string;
  formLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell relative mx-auto grid min-h-[100dvh] w-full max-w-[1600px] grid-cols-1 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,760px)_clamp(72px,9vw,150px)_minmax(320px,440px)] lg:items-center lg:px-12 lg:py-12 xl:px-16">
      <div className="flex min-h-10 items-start lg:absolute lg:top-12 lg:left-12 xl:left-16">
        <Link
          href="/"
          aria-label="Inspora home"
          className="focus-ring inline-flex text-[#262626]"
        >
          <BrandMark />
        </Link>
      </div>

      <section
        aria-labelledby="public-auth-heading"
        className="mt-14 self-center lg:mt-0"
      >
        <h1
          id="public-auth-heading"
          className="max-w-[760px] text-[clamp(36px,5vw,72px)] font-medium leading-[0.98] tracking-[-0.055em]"
        >
          {heading}
        </h1>
        <p className="mt-5 max-w-md text-[clamp(15px,1.15vw,17px)] leading-relaxed text-[#666]">
          {description}
        </p>
      </section>

      <div
        aria-hidden="true"
        className="my-10 h-px w-full self-center bg-[#d9d9d4] lg:my-0 lg:h-auto lg:w-auto lg:bg-transparent lg:text-center lg:text-[clamp(96px,11vw,180px)] lg:font-extralight lg:leading-none lg:text-[#d9d9d4]"
      >
        <span className="hidden lg:inline">&#92;</span>
      </div>

      <section aria-label={formLabel} className="w-full max-w-[440px] justify-self-end">
        {children}
      </section>
    </div>
  );
}

export function PublicAuthPage({ flow }: { flow: AuthFlow }) {
  const content = flowContent[flow];

  if (!isClerkConfigured()) {
    return (
      <AuthShell {...content}>
        <div className="border border-black/10 bg-[#f5f5f2] p-6 sm:p-8">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#666]">
            Clerk configuration is required
          </p>
          <p className="mt-3 text-[20px] font-medium tracking-[-0.03em]">
            Authentication is not available yet.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#666]">
            Please return later or continue browsing Inspora.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell {...content}>
      <Suspense
        fallback={
          <div
            aria-label={"Loading " + content.formLabel.toLowerCase()}
            className="min-h-[420px] w-full border border-black/10 bg-[#f5f5f2]"
          />
        }
      >
        {flow === "sign-in" ? <SignIn /> : <SignUp />}
      </Suspense>
    </AuthShell>
  );
}
