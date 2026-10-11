"use client";
import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { SponsorLoading } from "./sponsor-loading";
export function SponsorOwnerBoundary({ ownerUserId, children }: { ownerUserId: string; children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  return isLoaded && isSignedIn && userId === ownerUserId ? children : <SponsorLoading />;
}
