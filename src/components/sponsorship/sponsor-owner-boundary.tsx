"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { SponsorLoading } from "./sponsor-loading";
import { hasSponsorSecondFactor } from "@/features/sponsorship/security-state";
export function SponsorOwnerBoundary({ ownerUserId, children, securityFallback, securityView }: { ownerUserId: string; children: ReactNode; securityFallback?: ReactNode; securityView?: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionClaims } = useAuth();
  const { user } = useUser();
  if (!isLoaded || !isSignedIn || userId !== ownerUserId) return <SponsorLoading />;
  if (!user) return <SponsorLoading />;
  // Only the account-security UI belongs here; private campaign/billing data
  // remains in children and still requires proof of any enabled second factor.
  if (securityView) return securityView;
  if (user.totpEnabled && !hasSponsorSecondFactor(sessionClaims?.fva))
    return securityFallback ?? <main className="mx-auto max-w-[560px] px-4 py-16"><p>Verify the authenticator you enabled for this account.</p><a className="focus-ring mt-4 inline-block text-sm underline underline-offset-4" href="/sponsor/security">Verify account security</a></main>;
  return children;
}
