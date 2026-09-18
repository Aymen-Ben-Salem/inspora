import Image from "next/image";

import { CreatorAvatar } from "@/components/creator-avatar";
import type { CreatorProfile } from "@/features/creators/types";

export function ProfileHeader({
  profile, owner, works, onEdit, onSettings,
}: {
  profile: CreatorProfile;
  owner: boolean;
  works: number;
  onEdit?: () => void;
  onSettings?: () => void;
}) {
  return (
    <header className="archive-frame mt-8 mb-[18px] flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-[18px]">
        <CreatorAvatar creator={profile} role="feed" width={174} height={174}
          sizes="(max-width: 639px) 96px, 174px"
          className="size-24 shrink-0 rounded-full object-cover sm:size-[174px]" />
        <div className="flex min-w-0 flex-col items-start gap-4">
          {profile.xProfileUrl || profile.websiteUrl ? (
            <div className="flex h-[18px] items-center gap-[10px]">
              {profile.xProfileUrl ? (
                <a className="focus-ring relative block size-[18px] overflow-hidden" href={profile.xProfileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${profile.name} on X`}>
                  <Image src="/icons/profile/social-links.svg" alt="" width={45} height={18} className="absolute left-0 top-0 h-[18px] w-[45px] max-w-none" />
                </a>
              ) : null}
              {profile.websiteUrl ? (
                <a className="focus-ring relative block size-[18px] overflow-hidden" href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`${profile.name}'s website`}>
                  <Image src="/icons/profile/social-links.svg" alt="" width={45} height={18} className="absolute right-0 top-0 h-[18px] w-[45px] max-w-none" />
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="break-words text-[28px] font-medium leading-[normal] tracking-[-0.02em] text-[#262626] sm:text-[40px]">{profile.name}</h1>
            <p className="mt-2 break-all text-base leading-[normal] tracking-[-0.32px] text-[#767676]">@{profile.username}</p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-base leading-[normal] tracking-[-0.32px]">
            <div className="flex items-baseline gap-1"><dd className="text-[#262626]">{works}</dd><dt className="text-[#767676]">Works</dt></div>
            <div className="flex items-baseline gap-1"><dd aria-label="Views unavailable" className="text-[#262626]">—</dd><dt className="text-[#767676]">Views</dt></div>
          </dl>
        </div>
      </div>
      {owner ? (
        <div className="ml-auto flex items-start gap-[10px]">
          <button type="button" onClick={onEdit} className="focus-ring flex h-12 cursor-pointer items-center justify-center gap-[10px] px-4 py-3 text-sm leading-[normal] tracking-[0.2px] text-[#262626] hover:bg-[#fafafa]">
            <Image src="/icons/profile/edit.svg" alt="" width={20} height={20} className="size-5" />
            Edit Profile
          </button>
          <button type="button" onClick={onSettings} aria-label="Settings" className="focus-ring grid size-12 cursor-pointer place-items-center rounded-full hover:bg-[#fafafa]">
            <Image src="/icons/profile/settings.svg" alt="" width={28} height={30} className="h-[30px] w-7" />
          </button>
        </div>
      ) : null}
    </header>
  );
}
