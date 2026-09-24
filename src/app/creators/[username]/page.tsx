import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getCreatorViews } from "@/analytics/creator-views";
import { ProfilePage } from "@/components/profile/profile-page";
import { buildCreatorMetadata, buildCreatorStructuredData, serializeJsonLd } from "@/lib/seo";
import {
  getPublishedCreatorWorkCounts,
  getPublishedCreatorWorkPage,
  isCreatorWorkFilter,
  resolvePublicCreatorProfile,
} from "@/features/profiles/repository";

type CreatorPageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
};

export async function generateMetadata({ params }: CreatorPageProps): Promise<Metadata> {
  const resolved = await resolvePublicCreatorProfile((await params).username);
  if (!resolved) return { title: "Creator not found" };
  return buildCreatorMetadata(resolved.profile, resolved.canonicalUsername);
}

export default async function PublicCreatorPage({ params, searchParams }: CreatorPageProps) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const resolved = await resolvePublicCreatorProfile(username);
  if (!resolved) notFound();
  if (resolved.isAlias) {
    permanentRedirect(`/creators/${resolved.canonicalUsername}` as Route);
  }
  const rawFilter = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const filter = rawFilter && isCreatorWorkFilter(rawFilter) ? rawFilter : "all";
  const [initialPage, counts, views] = await Promise.all([
    getPublishedCreatorWorkPage({ creatorId: resolved.profile.id, filter }),
    getPublishedCreatorWorkCounts(resolved.profile.id),
    getCreatorViews(resolved.profile.id),
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: serializeJsonLd(buildCreatorStructuredData(resolved.profile, resolved.canonicalUsername)),
      }} />
    <ProfilePage
      profile={resolved.profile}
      initialPage={initialPage}
      counts={counts}
      filter={filter}
      views={views}
    />
    </>
  );
}
