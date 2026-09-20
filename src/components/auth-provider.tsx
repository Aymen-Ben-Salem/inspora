import "server-only";

import { ClerkProvider } from "@clerk/nextjs";
import { Suspense, type PropsWithChildren } from "react";

import { clerkAppearance, clerkLocalization } from "../auth/appearance";
import { isClerkConfigured } from "../auth/config";
import { SavedPostsProvider } from "./saved-posts-provider";
import {
  ClerkSubmissionProvider,
  PublicSubmissionProvider,
} from "./submissions/submission-provider";

export function AuthProvider({ children }: PropsWithChildren) {
  if (!isClerkConfigured()) {
    return <PublicSubmissionProvider>{children}</PublicSubmissionProvider>;
  }

  return (
    <Suspense
      fallback={
        <div
          aria-label="Loading authentication"
          className="min-h-[100dvh] bg-[#f5f5f2]"
        />
      }
    >
      <ClerkProvider
        appearance={clerkAppearance}
        localization={clerkLocalization}
      >
        <ClerkSubmissionProvider>
          <SavedPostsProvider>{children}</SavedPostsProvider>
        </ClerkSubmissionProvider>
      </ClerkProvider>
    </Suspense>
  );
}
