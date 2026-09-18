import { SiteNavbar } from "@/components/site-navbar";
import type { CreatorProfile } from "@/features/creators/types";
import type { CreatorWorkFilter, CreatorWorkPage, ProfileWorkCounts } from "@/features/profiles/types";

import { ProfilePageClient } from "./profile-page-client";

export function ProfilePage(props: {
  counts: ProfileWorkCounts;
  filter: CreatorWorkFilter;
  initialModal?: "edit" | "settings" | null;
  initialPage: CreatorWorkPage;
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
