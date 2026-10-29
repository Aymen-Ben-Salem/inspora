import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getCreatorViews } from "@/analytics/creator-views";
import { isClerkConfigured } from "@/auth/config";
import { ProfilePage } from "@/components/profile/profile-page";
import { ensureCreatorForOwner } from "@/features/creators/identity";
import { getOwnCreatorClaims } from "@/features/creators/identity/claim-requests";
import {
  getPublishedCreatorWorkCounts,
  getPublishedCreatorWorkPage,
  isCreatorWorkFilter,
} from "@/features/profiles/repository";
import { getOwnProfileActivity } from "@/features/profiles/messages-repository";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default async function OwnerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[]; modal?: string | string[]; submission?: string | string[] }>;
}) {
  if (!isClerkConfigured()) redirect("/sign-in?redirect_url=%2Fprofile" as Route);
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in?redirect_url=%2Fprofile" as Route);
  const rawFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = rawFilter === "in-review"
    ? "in-review"
    : rawFilter && isCreatorWorkFilter(rawFilter)
      ? rawFilter
      : "all";
  const rawModal = Array.isArray(params.modal) ? params.modal[0] : params.modal;
  const profile = await ensureCreatorForOwner({ userId });
  const rawSubmission = Array.isArray(params.submission) ? params.submission[0] : params.submission;
  const [initialPage, counts, activity, views, claims] = await Promise.all([
    getPublishedCreatorWorkPage({
      creatorId: profile.id,
      filter: filter === "in-review" ? "all" : filter,
    }),
    getPublishedCreatorWorkCounts(profile.id),
    getOwnProfileActivity(userId),
    getCreatorViews(profile.id),
    getOwnCreatorClaims(userId, { notifications: true }),
  ]);
  return (
    <ProfilePage
      claims={claims.items}
      profile={profile}
      initialPage={initialPage}
      counts={counts}
      filter={filter}
      activity={activity}
      initialSubmissionId={rawSubmission}
      owner
      views={views}
      initialModal={rawModal === "settings" ? "settings" : rawModal === "edit" ? "edit" : null}
    />
  );
}
