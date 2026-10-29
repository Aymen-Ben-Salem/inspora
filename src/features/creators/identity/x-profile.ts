import "server-only";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creators } from "@/db/schema";
import { isCreatorVisibleInEnvironment } from "@/features/admin/creator-environment-policy";
import { lookupXProfile, XLookupError } from "../x-api";
import { normalizeXProfileUrl } from "../validation";
import type { verifiedXIdentityForUser } from "./external-identity";

type CreatorXProfile = Pick<typeof creators.$inferSelect, "xProfileUrl" | "xProfileAccountId" | "xProviderId">;

export async function resolveCreatorXAccount(target: CreatorXProfile): Promise<string | null> {
  if (target.xProviderId && target.xProfileAccountId && target.xProviderId !== target.xProfileAccountId) {
    throw new XLookupError("unavailable", "This profile has conflicting X associations. Please report the attribution problem.");
  }
  // A saved account ID survives handle changes and must never be reassigned by a fresh handle lookup.
  if (target.xProviderId || target.xProfileAccountId) return target.xProviderId || target.xProfileAccountId;
  if (!target.xProfileUrl) return null;
  return (await lookupXProfile(target.xProfileUrl)).id;
}

export async function findXCreatorCandidates(identity: NonNullable<Awaited<ReturnType<typeof verifiedXIdentityForUser>>>, excludeId?: string) {
  const urls = ["x.com", "twitter.com", "www.x.com", "www.twitter.com"].flatMap(host => ["http", "https"].map(protocol => `${protocol}://${host}/${identity.username}`));
  const rows = await requireDatabase().select().from(creators).where(and(
    excludeId ? ne(creators.id, excludeId) : undefined,
    or(eq(creators.xProviderId, identity.providerAccountId), eq(creators.xProfileAccountId, identity.providerAccountId),
      and(isNull(creators.xProviderId), isNull(creators.xProfileAccountId), inArray(sql`lower(rtrim(${creators.xProfileUrl}, '/'))`, urls))),
  ));
  return rows.filter(row => isCreatorVisibleInEnvironment(row.handle, process.env.DATA_ENVIRONMENT));
}

export function sameXProfileSnapshot(a: CreatorXProfile, b: CreatorXProfile) {
  return a.xProfileUrl === b.xProfileUrl && a.xProfileAccountId === b.xProfileAccountId && a.xProviderId === b.xProviderId;
}

export async function adminXProfileAccountId(url: string | null, existing?: CreatorXProfile) {
  if (!url) return null;
  if (existing?.xProfileUrl === url && (existing.xProfileAccountId || existing.xProviderId)) {
    return existing.xProfileAccountId || existing.xProviderId;
  }
  return (await lookupXProfile(normalizeXProfileUrl(url))).id;
}
