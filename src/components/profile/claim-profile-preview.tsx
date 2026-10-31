import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { CreatorAvatar } from "@/components/creator-avatar";
import { ResponsiveR2Image } from "@/components/responsive-r2-image";
import type { CreatorClaimPreview } from "@/features/creators/types";

export function ClaimProfilePreview({ preview, reporting = false, action }: { preview: CreatorClaimPreview; reporting?: boolean; action?: ReactNode }) {
  const { profile, workCount, thumbnails } = preview;
  return <section aria-label="Creator profile to claim">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 className="text-sm font-medium">{reporting ? "Profile you’re reporting" : "Profile you’re claiming"}</h2>
      {action}
    </div>
    <div className="flex items-start gap-4">
      <CreatorAvatar creator={profile} role="dialog" width={56} height={56} sizes="56px" className="size-14 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[20px] leading-tight tracking-[-0.02em]">{profile.name}</p>
        <p className="mt-1 break-all text-sm text-[#767676]">@{profile.username}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-[#767676]">{workCount} published {workCount === 1 ? "work" : "works"}</p>
          <Link href={("/creators/" + profile.username) as Route} target="_blank" rel="noopener noreferrer" aria-label={`View ${profile.name}’s profile (opens in a new tab)`} className="focus-ring inline-flex min-h-11 shrink-0 cursor-pointer items-center text-sm underline decoration-black/25 underline-offset-4 hover:decoration-black">View profile</Link>
        </div>
      </div>
    </div>
    {thumbnails.length ? <div className="mt-5 hidden max-w-[320px] grid-cols-3 gap-2 lg:grid">
      {thumbnails.map(item => <ResponsiveR2Image key={item.url} src={item.url} alt={item.title} width={320} height={240} sizes="100px" className="aspect-[4/3] h-auto w-full object-cover" />)}
    </div> : null}
  </section>;
}
