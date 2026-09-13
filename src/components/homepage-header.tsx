import type { PostCategory, PostView } from "@/domain/post";

import { PublicAuthControls } from "./auth/public-auth-controls";
import {
  HomepageHeaderClient,
  type ArchivePage,
} from "./homepage-header-client";

export function HomepageHeader({
  category,
  view = "latest",
  page = "design",
  showArchiveContent = true,
}: {
  category?: PostCategory;
  view?: PostView;
  page?: ArchivePage;
  showArchiveContent?: boolean;
}) {
  return (
    <HomepageHeaderClient
      category={category}
      view={view}
      page={page}
      showArchiveContent={showArchiveContent}
      desktopAuth={<PublicAuthControls variant="desktop" />}
      mobileAuth={<PublicAuthControls variant="mobile" />}
    />
  );
}
