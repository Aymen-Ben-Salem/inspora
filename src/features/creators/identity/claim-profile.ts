import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { readAccountCapabilities } from "@/features/sponsorship/authorization";
import { isCreatorVisibleInEnvironment } from "@/features/admin/creator-environment-policy";
import { verifiedXIdentityForUser } from "./external-identity";
import { normalizeXProfileUrl, validateCreatorUsername } from "../validation";
import type { ClaimUsernameAvailability } from "../types";

export class ClaimProfileError extends Error {
  constructor(readonly field: "name" | "username", message: string) { super(message); this.name = "ClaimProfileError"; }
}

// Read feedback is advisory. Approval repeats this check inside its write transaction,
// and unique indexes arbitrate competing claims or profile edits.
export async function isClaimUsernameAvailable(db: Pick<WriteTx, "select">, username: string, allowedCreatorIds: string[]) {
  const [aliases, current] = await Promise.all([
    db.select({ creatorId: creatorUsernameAliases.creatorId }).from(creatorUsernameAliases).where(eq(sql`lower(${creatorUsernameAliases.username})`, username.toLowerCase())).limit(1),
    db.select({ creatorId: creators.id }).from(creators).where(eq(sql`lower(${creators.username})`, username.toLowerCase())).limit(1),
  ]);
  return [...aliases, ...current].every(row => allowedCreatorIds.includes(row.creatorId));
}

export async function getClaimUsernameAvailability(userId: string, targetId: string, username: string): Promise<ClaimUsernameAvailability> {
  const validation = validateCreatorUsername(username);
  if (!validation.ok) return { status: "unavailable", message: validation.message };
  if (!(await readAccountCapabilities(userId)).viewer) return { status: "error", message: "Sign in to check this username." };
  const db = requireDatabase();
  const [identity, target, source] = await Promise.all([
    verifiedXIdentityForUser(userId),
    db.query.creators.findFirst({ where: eq(creators.id, targetId) }),
    db.query.creators.findFirst({ where: eq(creators.ownerUserId, userId) }),
  ]);
  if (!identity || !target || target.trashedAt || (target.ownerUserId && target.ownerUserId !== userId) ||
      !isCreatorVisibleInEnvironment(target.handle, process.env.DATA_ENVIRONMENT)) {
    return { status: "error", message: "Reload this page to check the profile again." };
  }
  const savedIds = [target.xProviderId, target.xProfileAccountId].filter(Boolean);
  let matches = savedIds.length > 0 && savedIds.every(id => id === identity.providerAccountId);
  // A URL-only target still needs an official X lookup at claim time. Typing never
  // spends X API credits or treats the editable URL as ownership evidence.
  if (!savedIds.length && target.xProfileUrl) {
    try { matches = normalizeXProfileUrl(target.xProfileUrl) === identity.profileUrl; } catch { /* Invalid attribution. */ }
  }
  if (!matches) return { status: "error", message: "Reload this page to verify your X connection." };
  const allowed = [target.id, ...(source && !source.trashedAt ? [source.id] : [])];
  return await isClaimUsernameAvailable(db, username, allowed)
    ? { status: "available", message: "Available for your profile." }
    : { status: "unavailable", message: "That username is unavailable. Choose another." };
}
