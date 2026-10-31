import Link from "next/link";
import type { Route } from "next";
import { CreatorAvatar } from "@/components/creator-avatar";
import { ResponsiveR2Image } from "@/components/responsive-r2-image";
import type { CreatorClaimPreview } from "@/features/creators/types";

export function ClaimProfilePreview({ preview }: { preview: CreatorClaimPreview }) {
  const { profile, workCount, thumbnails } = preview;
  return <section aria-label="Creator profile to claim" className="overflow-hidden rounded-[3px] border border-[#e6e6e6]">
    <div className="flex items-center gap-4 p-5">
      <CreatorAvatar creator={profile} role="dialog" width={64} height={64} sizes="64px" className="size-16 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-lg font-medium tracking-[-0.3px]">{profile.name}</p>
        <p className="mt-1 break-all text-sm text-[#767676]">@{profile.username}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-xs text-[#767676]">{workCount} published {workCount === 1 ? "work" : "works"}</p>
          <Link href={("/creators/" + profile.username) as Route} target="_blank" rel="noopener noreferrer" aria-label={`View ${profile.name}’s profile (opens in a new tab)`} className="focus-ring shrink-0 cursor-pointer py-2 text-xs underline underline-offset-4 hover:text-black">View profile</Link>
        </div>
      </div>
    </div>
    {thumbnails.length ? <div className="flex gap-2 border-t border-[#e6e6e6] bg-[#fafafa] p-3">
      {thumbnails.map(item => <ResponsiveR2Image key={item.url} src={item.url} alt={item.title} width={320} height={240} sizes="112px" className="aspect-[4/3] h-auto w-[calc((100%-1rem)/3)] max-w-28 rounded-[2px] object-cover" />)}
    </div> : null}
  </section>;
}
