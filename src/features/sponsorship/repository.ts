import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDatabase, requireDatabase } from "@/db/client";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import {
  profileAccounts,
  sponsorAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import type { PreparationStore, PreparationTransaction } from "./campaigns";
import { sponsorAccountCanWrite } from "./capabilities";
import type {
  CreativeSnapshot,
  OwnedCampaign,
  SponsorActor,
  SponsorPreparation,
  SponsorUpload,
  VerifiedSponsorAsset,
} from "./types";

export async function withSponsorWrite<T>(
  work: (tx: WriteTx) => Promise<T>,
): Promise<T> {
  return withWriteTransaction(async (tx) => {
    await tx.execute(
      sql`select set_config('inspora.sponsor_writer', 'on', true)`,
    );
    return work(tx);
  });
}
export async function lockSponsorOwner(
  tx: WriteTx,
  owner: string,
  mode: "read" | "write" = "write",
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + owner}, 0))`,
  );
  const [identity] = await tx
    .select()
    .from(sponsorIdentities)
    .where(eq(sponsorIdentities.userId, owner));
  if (!identity || identity.state !== "allowed")
    throw new Error("Sponsor access is unavailable.");
  const [account] = await tx
    .select()
    .from(sponsorAccounts)
    .where(eq(sponsorAccounts.ownerUserId, owner));
  if (
    account &&
    (["revoked", "deleting"].includes(account.state) ||
      (mode === "write" && !sponsorAccountCanWrite(account.state)))
  )
    throw new Error("Sponsor access is unavailable.");
}
export async function readSponsorAccountForOwner(
  userId: string,
): Promise<SponsorActor | null> {
  const row = await requireDatabase().query.sponsorAccounts.findFirst({
    where: eq(sponsorAccounts.ownerUserId, userId),
  });
  return row
    ? { userId, accountId: row.id, state: row.state as SponsorActor["state"] }
    : null;
}
export async function readIdentityCapabilities(userId: string) {
  const database = getDatabase();
  if (!database) throw new Error("DATABASE_URL is not configured.");
  const [profile, identity, account] = await Promise.all([
    database.query.profileAccounts.findFirst({
      where: eq(profileAccounts.userId, userId),
    }),
    database.query.sponsorIdentities.findFirst({
      where: eq(sponsorIdentities.userId, userId),
    }),
    database.query.sponsorAccounts.findFirst({
      where: eq(sponsorAccounts.ownerUserId, userId),
    }),
  ]);
  return {
    profile: profile?.status ?? null,
    identity: identity?.state ?? null,
    account: account?.state ?? null,
  };
}
export async function bindSponsorIdentity(userId: string) {
  await withSponsorWrite(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + userId}, 0))`,
    );
    await tx.insert(sponsorIdentities).values({ userId }).onConflictDoNothing();
    await lockSponsorOwner(tx, userId);
  });
}
export function assetView(row: SponsorUpload): VerifiedSponsorAsset {
  if (row.state !== "verified" || !row.digest || !row.width || !row.height)
    throw new Error("Unverified sponsor asset.");
  return {
    id: row.id,
    kind: row.kind,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    digest: row.digest,
    url: `/api/sponsorship/assets/${row.id}`,
    ...(row.sourceAssetId ? { sourceAssetId: row.sourceAssetId } : {}),
  };
}
function preparation(
  row: typeof sponsorCheckouts.$inferSelect,
): SponsorPreparation {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    state: row.state as SponsorPreparation["state"],
    expiresAt: row.expiresAt,
    revision: row.revision,
    campaign: row.snapshot,
  };
}
export function preparationTransaction(tx: WriteTx): PreparationTransaction {
  return {
    lockOwner: (owner) => lockSponsorOwner(tx, owner),
    findPreparation: async (owner) => {
      const [row] = await tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.ownerUserId, owner))
        .orderBy(sql`${sponsorCheckouts.createdAt} desc`)
        .limit(1);
      return row ? preparation(row) : null;
    },
    createPreparation: async (ownerUserId, expiresAt) => {
      const [row] = await tx
        .insert(sponsorCheckouts)
        .values({ ownerUserId, expiresAt })
        .returning();
      return preparation(row);
    },
    expirePreparation: async (p) => {
      await tx
        .update(sponsorCheckouts)
        .set({ state: "expired" })
        .where(
          and(
            eq(sponsorCheckouts.id, p.id),
            eq(sponsorCheckouts.ownerUserId, p.ownerUserId),
          ),
        );
    },
    findOwnedAsset: async (owner, id, checkoutId, now) => {
      const [row] = await tx
        .select()
        .from(sponsorAssets)
        .where(
          and(
            eq(sponsorAssets.id, id),
            eq(sponsorAssets.ownerUserId, owner),
            eq(sponsorAssets.checkoutId, checkoutId),
            eq(sponsorAssets.state, "verified"),
            gt(sponsorAssets.expiresAt, now),
          ),
        );
      return row ? assetView(row as SponsorUpload) : null;
    },
    freezeCampaign: async (p, creative: CreativeSnapshot) => {
      const id = p.campaign?.id ?? randomUUID(),
        versionId = randomUUID(),
        revision = p.revision + 1;
      const media = creative.assets.find((a) => a.id === creative.mediaId);
      const values = {
        title: creative.title,
        url: creative.url,
        tagline: creative.tagline,
        internalName: creative.title,
        revision,
        isActive: false,
        ownerUserId: p.ownerUserId,
        campaignState: "prepared",
        mediaType: media?.contentType.startsWith("video/") ? "video" : "image",
        mediaWidth: media?.width ?? 1200,
        mediaHeight: media?.height ?? 800,
      };
      if (p.campaign)
        await tx
          .update(sponsors)
          .set(values)
          .where(
            and(eq(sponsors.id, id), eq(sponsors.ownerUserId, p.ownerUserId)),
          );
      else await tx.insert(sponsors).values({ ...values, id });
      await tx.insert(sponsorCampaignVersions).values({
        id: versionId,
        campaignId: id,
        ownerUserId: p.ownerUserId,
        revision,
        creative,
      });
      await tx.insert(sponsorVersionAssets).values(
        creative.assets.map((a) => ({
          versionId,
          assetId: a.id,
          ownerUserId: p.ownerUserId,
        })),
      );
      const campaign: OwnedCampaign = {
        id,
        checkoutId: p.id,
        versionId,
        revision,
        state: "prepared",
        expiresAt: p.expiresAt.toISOString(),
        creative,
      };
      await tx
        .update(sponsorCheckouts)
        .set({ campaignId: id, revision, state: "ready", snapshot: campaign })
        .where(
          and(
            eq(sponsorCheckouts.id, p.id),
            eq(sponsorCheckouts.ownerUserId, p.ownerUserId),
          ),
        );
      return campaign;
    },
  };
}
export const preparationStore: PreparationStore = {
  transaction: (work) =>
    withSponsorWrite((tx) => work(preparationTransaction(tx))),
};
export async function readSeatAvailability(): Promise<number | null> {
  try {
    const db = getDatabase();
    if (!db) return null;
    const rows = await db.select().from(sponsorSeats);
    if (rows.length !== 4) return null;
    return rows.filter((row) => row.state === "free").length;
  } catch {
    return null;
  }
}
export async function findOwnUpload(tx: WriteTx, owner: string, id: string) {
  const [row] = await tx
    .select()
    .from(sponsorAssets)
    .where(and(eq(sponsorAssets.id, id), eq(sponsorAssets.ownerUserId, owner)));
  return row as SponsorUpload | undefined;
}
export async function readOwnCampaign(
  actor: SponsorActor,
  campaignId: string,
): Promise<OwnedCampaign | null> {
  if (["revoked", "deleting"].includes(actor.state)) return null;
  const row = await requireDatabase().query.sponsorCheckouts.findFirst({
    where: and(
      eq(sponsorCheckouts.ownerUserId, actor.userId),
      eq(sponsorCheckouts.campaignId, campaignId),
      inArray(sponsorCheckouts.state, ["preparing", "ready"]),
    ),
  });
  return row?.snapshot ?? null;
}
