import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { isClerkConfigured } from "@/auth/config";
import { ProfilePage } from "@/components/profile/profile-page";
import { ensureOwnedCreator } from "@/features/creators/repository";
import { requestCreatorClaimFromVerifiedX } from "@/features/creators/claims";
import {
  getPublishedCreatorWorkCounts,
  getPublishedCreatorWorkPage,
  isCreatorWorkFilter,
} from "@/features/profiles/repository";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default async function OwnerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[]; modal?: string | string[] }>;
}) {
  if (!isClerkConfigured()) redirect("/sign-in?redirect_url=%2Fprofile" as Route);
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in?redirect_url=%2Fprofile" as Route);
  const rawFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = rawFilter && isCreatorWorkFilter(rawFilter) ? rawFilter : "all";
  const rawModal = Array.isArray(params.modal) ? params.modal[0] : params.modal;
  if (rawModal === "edit") {
    await requestCreatorClaimFromVerifiedX(userId).catch((error) => {
      console.error("Verified X profile synchronization failed", error);
    });
  }
  const profile = await ensureOwnedCreator(userId);
  const [initialPage, counts] = await Promise.all([
    getPublishedCreatorWorkPage({ creatorId: profile.id, filter }),
    getPublishedCreatorWorkCounts(profile.id),
  ]);
  return (
    <ProfilePage
      profile={profile}
      initialPage={initialPage}
      counts={counts}
      filter={filter}
      owner
      initialModal={rawModal === "settings" ? "settings" : rawModal === "edit" ? "edit" : null}
    />
  );
}
