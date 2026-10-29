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
    className="focus-ring cursor-pointer rounded-full border border-black/15 px-4 py-2.5 text-sm text-[#262626] hover:bg-[#f7f7f4]">
    {own ? "Manage your profile" : target.ownerUserId ? "Report ownership problem" : "Claim this profile"}
  </Link>;
}
