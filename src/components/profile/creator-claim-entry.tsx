import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { isClerkConfigured } from "@/auth/config";
import { requireDatabase } from "@/db/client";
import { creators } from "@/db/schema";

export async function CreatorClaimEntry({ creatorId, username }: { creatorId: string; username: string }) {
  const [target, session] = await Promise.all([
    requireDatabase().query.creators.findFirst({ where: eq(creators.id, creatorId), columns: { ownerUserId: true } }),
    isClerkConfigured() ? auth() : Promise.resolve({ userId: null }),
  ]);
  if (!target) return null;
  const own = Boolean(session.userId && target.ownerUserId === session.userId);
  return <Link href={(own ? "/profile" : "/creators/" + username + "/claim") as Route}
    className="focus-ring fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 cursor-pointer rounded-full border border-black/15 bg-white px-5 py-3 text-sm text-[#262626] shadow-sm transition-colors hover:border-[#262626] hover:bg-[#262626] hover:text-white">
    {own ? "Manage your profile" : target.ownerUserId ? "Report ownership problem" : "Claim this profile"}
  </Link>;
}
