import { SiteNavbar } from "@/components/site-navbar";
import type { CreatorProfile } from "@/features/creators/types";
import type { OwnProfileActivity } from "@/features/profiles/messages-repository";
import type { CreatorWorkFilter, CreatorWorkPage, ProfileWorkCounts } from "@/features/profiles/types";

import { ProfilePageClient } from "./profile-page-client";

export function ProfilePage(props: {
  activity?: OwnProfileActivity;
  counts: ProfileWorkCounts;
  filter: CreatorWorkFilter | "in-review";
  initialModal?: "edit" | "settings" | null;
  initialPage: CreatorWorkPage;
  initialSubmissionId?: string;
  owner?: boolean;
  profile: CreatorProfile;
}) {
  return (
    <main className="min-h-[100dvh] overflow-x-clip bg-white">
      <SiteNavbar page="profile" />
      <ProfilePageClient key={props.profile.id} {...props} />
    </main>
  );
}
