"use client";

import { SignIn, useClerk } from "@clerk/nextjs";
import { useSignUp } from "@clerk/nextjs/legacy";
import type { SignUpResource } from "@clerk/shared/types";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { publicAuthAppearance } from "../../auth/appearance";
import { BrandMark } from "../brand-mark";
import { continueEmailSignUp, type EmailSignUpContinuation } from "./continue-email-sign-up";
import { useAuthPathname } from "./use-auth-pathname";

function ClerkPublicSignIn() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      withSignUp
      appearance={publicAuthAppearance}
      forceRedirectUrl="/"
      signUpForceRedirectUrl="/"
    />
  );
}

function ContinueEmailSignUp({ signUp, emailAddress }: {
  signUp: SignUpResource;
  emailAddress: string;
}) {
  const clerk = useClerk();
  const router = useRouter();
  const [submission] = useState(() => ({ signUp, emailAddress }));
  const request = useRef<Promise<EmailSignUpContinuation> | null>(null);
  const [state, setState] = useState<"pending" | "error" | "required-fields">("pending");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    // Reuse the submission across Strict Mode effect replays and SDK updates.
    request.current ??= continueEmailSignUp(submission.signUp, submission.emailAddress);
    void request.current.then(async (result) => {
      if (!active) return;
      if (result.kind === "required-fields") {
        setState("required-fields");
      } else if (result.kind === "navigate") {
        router.replace(result.path, { scroll: false });
      } else {
        await clerk.setActive({
          session: result.sessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (!active) return;
            const destination = session?.currentTask ? "/sign-in/create/tasks" : "/";
            router.replace(decorateUrl(destination) as Route, { scroll: false });
          },
        });
      }
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, [clerk, retry, router, submission]);

  if (state === "required-fields") return <ClerkPublicSignIn />;

  return (
    <div className="flex min-h-[493px] flex-col items-center justify-center gap-6 bg-white px-10 py-20 text-center">
      <div className="h-[50px] w-14"><BrandMark /></div>
      {state === "error" ? (
        <>
          <p role="alert" className="text-sm text-[#b42318]">We couldn’t continue with your email. Please try again.</p>
          <button type="button" className="focus-ring bg-[#262626] px-5 py-3 text-sm text-white" onClick={() => {
            request.current = null;
            setState("pending");
            setRetry(value => value + 1);
          }}>Try again</button>
        </>
      ) : <p role="status" className="text-sm text-[#787878]">Continuing with your email…</p>}
      <div id="clerk-captcha" />
    </div>
  );
}

export function PublicSignIn() {
  const pathname = useAuthPathname();
  const { signUp } = useSignUp();
  const [entry, setEntry] = useState({ path: pathname, fromEmailForm: false });
  if (entry.path !== pathname) {
    setEntry({
      path: pathname,
      fromEmailForm: entry.path === "/sign-in" && pathname === "/sign-in/create",
    });
  }

  // Only the combined flow's initial email transfer needs this handoff.
  // A fresh email submission may replace a stale unfinished sign-up attempt.
  // Direct resumes, OAuth callbacks and verification stay with Clerk.
  if (pathname === "/sign-in/create" && signUp?.emailAddress && (!signUp.id || entry.fromEmailForm)) {
    return <ContinueEmailSignUp key={signUp.emailAddress} signUp={signUp} emailAddress={signUp.emailAddress} />;
  }
  return <ClerkPublicSignIn />;
}
