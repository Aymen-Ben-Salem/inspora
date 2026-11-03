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

function ClerkPublicSignIn({ redirectUrl, basePath = "/sign-in", initialEmail }: AuthProps) {
  return (
    <SignIn
      routing="path"
      path={basePath}
      initialValues={initialEmail ? { emailAddress: initialEmail } : undefined}
      withSignUp
      appearance={basePath === "/sponsor/access" ? { ...publicAuthAppearance, elements: { ...publicAuthAppearance.elements, socialButtonsBlock: { display: "none" }, dividerRow: { display: "none" } } } : publicAuthAppearance}
      forceRedirectUrl={redirectUrl}
      signUpForceRedirectUrl={redirectUrl}
    />
  );
}

type AuthProps = { redirectUrl: string; basePath?: "/sign-in" | "/sponsor/access"; initialEmail?: string };

function ContinueEmailSignUp({ signUp, emailAddress, redirectUrl, basePath = "/sign-in" }: {
  signUp: SignUpResource;
  emailAddress: string;
  redirectUrl: string;
  basePath?: "/sign-in" | "/sponsor/access";
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
        router.replace(result.path.replace("/sign-in", basePath) as Route, { scroll: false });
      } else {
        await clerk.setActive({
          session: result.sessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (!active) return;
            const destination = session?.currentTask
              ? basePath + "/create/tasks"
              : redirectUrl;
            router.replace(decorateUrl(destination) as Route, { scroll: false });
          },
        });
      }
    }).catch(() => {
      if (active) setState("error");
    });
    return () => { active = false; };
  }, [clerk, redirectUrl, retry, router, submission, basePath]);

  if (state === "required-fields") {
    return <ClerkPublicSignIn redirectUrl={redirectUrl} basePath={basePath} />;
  }

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

export function PublicSignIn({ redirectUrl = "/", basePath = "/sign-in", initialEmail }: Partial<AuthProps>) {
  const pathname = useAuthPathname();
  const { signUp } = useSignUp();
  const [entry, setEntry] = useState({ path: pathname, fromEmailForm: false });
  if (entry.path !== pathname) {
    setEntry({
      path: pathname,
      fromEmailForm: entry.path === basePath && pathname === basePath + "/create",
    });
  }

  // Only the combined flow's initial email transfer needs this handoff.
  // A fresh email submission may replace a stale unfinished sign-up attempt.
  // Direct resumes, OAuth callbacks and verification stay with Clerk.
  if (pathname === basePath + "/create" && signUp?.emailAddress && (!signUp.id || entry.fromEmailForm)) {
    return (
      <ContinueEmailSignUp
        key={signUp.emailAddress}
        signUp={signUp}
        emailAddress={signUp.emailAddress}
        redirectUrl={redirectUrl}
        basePath={basePath}
      />
    );
  }
  return <ClerkPublicSignIn redirectUrl={redirectUrl} basePath={basePath} initialEmail={initialEmail} />;
}
