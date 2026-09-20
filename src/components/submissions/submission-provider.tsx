"use client";

import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  hasSubmissionIntent,
  navigateToSubmission,
  removeSubmissionIntent,
  submissionAuthHref,
} from "./submission-state";
import { SubmissionModal } from "./submission-modal";
import { useAuthPathname } from "../auth/use-auth-pathname";

type SubmissionContextValue = {
  openSubmission: () => void;
};

const SubmissionContext = createContext<SubmissionContextValue | null>(null);

export function SubmissionProvider({
  authLoaded,
  children,
  signedIn,
}: PropsWithChildren<{ authLoaded: boolean; signedIn: boolean }>) {
  const router = useRouter();
  const pathname = useAuthPathname();
  const [open, setOpen] = useState(false);
  const queued = useRef(false);

  const openSubmission = useCallback(() => {
    if (!authLoaded) {
      queued.current = true;
      return;
    }
    if (!signedIn) {
      router.push(submissionAuthHref() as Route);
      return;
    }
    setOpen(true);
  }, [authLoaded, router, signedIn]);

  useEffect(() => {
    if (!authLoaded || !queued.current) return;
    queued.current = false;
    queueMicrotask(openSubmission);
  }, [authLoaded, openSubmission]);

  useEffect(() => {
    if (!authLoaded || !signedIn) return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (!hasSubmissionIntent(current)) return;
    window.history.replaceState(window.history.state, "", removeSubmissionIntent(current));
    queueMicrotask(() => setOpen(true));
  }, [authLoaded, signedIn, pathname]);

  const value = useMemo(() => ({ openSubmission }), [openSubmission]);
  return (
    <SubmissionContext.Provider value={value}>
      {children}
      <SubmissionModal
        open={open}
        onDismiss={() => setOpen(false)}
        onSubmitted={(href) => {
          setOpen(false);
          navigateToSubmission(
            { push: (destination) => router.push(destination as Route) },
            href,
          );
        }}
      />
    </SubmissionContext.Provider>
  );
}

export function ClerkSubmissionProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <SubmissionProvider authLoaded={isLoaded} signedIn={Boolean(isSignedIn)}>
      {children}
    </SubmissionProvider>
  );
}

export function PublicSubmissionProvider({ children }: PropsWithChildren) {
  return (
    <SubmissionProvider authLoaded signedIn={false}>
      {children}
    </SubmissionProvider>
  );
}

export function useSubmission() {
  const value = useContext(SubmissionContext);
  if (!value) throw new Error("useSubmission must be used inside SubmissionProvider.");
  return value;
}
