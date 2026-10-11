"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { SponsorLoading } from "./sponsor-loading";
import { hasSponsorSecondFactor } from "@/features/sponsorship/security-state";
export function SponsorOwnerBoundary({ ownerUserId, children }: { ownerUserId: string; children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionClaims } = useAuth();
  const { user } = useUser();
  if (!isLoaded || !isSignedIn || userId !== ownerUserId) return <SponsorLoading />;
  if (!user?.totpEnabled || !hasSponsorSecondFactor(sessionClaims?.fva))
    return <main className="mx-auto max-w-[560px] px-4 py-16"><p>Secure your sponsor account with authenticator 2FA to continue.</p><a className="focus-ring mt-4 inline-block text-sm underline underline-offset-4" href="/sponsor/security">Verify account security</a></main>;
  return children;
}
