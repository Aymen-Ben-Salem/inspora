"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSubmission } from "@/components/submissions/submission-provider";
import type { CreatorProfile } from "@/features/creators/types";
import type { OwnProfileActivity } from "@/features/profiles/messages-repository";
import type { CreatorWorkFilter, CreatorWorkPage, ProfileWorkCounts } from "@/features/profiles/types";

import { EditProfile } from "./edit-profile";
import { ProfileFeed } from "./profile-feed";
import { ProfileHeader } from "./profile-header";
import { ProfileMessages } from "./profile-messages";
import { ProfileModal } from "./profile-modal";
import { ProfileSettings } from "./profile-settings";

type ProfileModalName = "edit" | "settings";

export function ProfilePageClient({
  activity = { messages: [], submissions: [] },
  counts,
  filter,
  initialModal = null,
  initialPage,
  initialSubmissionId,
  owner = false,
  profile,
}: {
  activity?: OwnProfileActivity;
  counts: ProfileWorkCounts;
  filter: CreatorWorkFilter | "in-review";
  initialModal?: ProfileModalName | null;
  initialPage: CreatorWorkPage;
  initialSubmissionId?: string;
  owner?: boolean;
  profile: CreatorProfile;
}) {
  const router = useRouter();
  const { openSubmission } = useSubmission();
  const [modal, setModal] = useState<ProfileModalName | null>(initialModal);
  const [dirty, setDirty] = useState(false);
  const baseHref = owner ? "/profile" : `/creators/${profile.username}`;

  function openModal(next: ProfileModalName) {
    setDirty(false);
    setModal(next);
    router.replace(`${baseHref}?modal=${next}` as Route, { scroll: false });
  }

  function closeModal() {
    setModal(null);
    setDirty(false);
    router.replace(baseHref as Route, { scroll: false });
  }

  return (
    <>
      <ProfileHeader
        profile={profile}
        owner={owner}
        works={counts.total}
        onEdit={() => openModal("edit")}
        onSettings={() => openModal("settings")}
      />
      {owner ? <ProfileMessages messages={activity.messages} /> : null}
      <ProfileFeed
        key={filter}
        baseHref={baseHref}
        counts={counts}
        creatorId={profile.id}
        filter={filter}
        initialPage={initialPage}
        initialSubmissionId={initialSubmissionId}
        owner={owner}
        submissions={activity.submissions}
      />
      {owner ? (
        <button type="button" onClick={openSubmission} className="focus-ring fixed bottom-[36px] left-1/2 z-30 min-h-[41px] w-[104px] -translate-x-1/2 cursor-pointer bg-[#262626] px-4 py-3 text-sm font-normal leading-[normal] tracking-[0.2px] text-white shadow-[0_1px_1px_#e6e6e6]">
          Submit
        </button>
      ) : null}
      <ProfileModal open={modal === "edit"} label="Edit Profile" dirty={dirty} onDismiss={closeModal}>
        <EditProfile profile={profile} onDirtyChange={setDirty} onSaved={() => setDirty(false)} />
      </ProfileModal>
      <ProfileModal open={modal === "settings"} label="Settings" onDismiss={closeModal}>
        <ProfileSettings onEdit={() => openModal("edit")} />
      </ProfileModal>
    </>
  );
}
