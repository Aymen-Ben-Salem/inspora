import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  sponsorAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { assetView, lockSponsorOwner, withSponsorWrite } from "./repository";
import { campaignInputSchema } from "./validation";
import { resolveSponsorCreative } from "./creative";
import { sponsorPublicCreative } from "./public-creative";
import type { SponsorPromoter } from "./public-media";
import type {
  CreativeSnapshot,
  OwnedCampaign,
  SponsorUpload,
  SponsorshipResult,
} from "./types";
type CampaignList = { campaigns: OwnedCampaign[]; readonly: boolean };
const denied = (
  code: "forbidden" | "conflict" | "invalid_input",
  message: string,
) => ({ ok: false as const, code, message });
export function createPaidCampaignService(deps: {
  owner(): Promise<string | null>;
  now(): Date;
  promote: SponsorPromoter;
}) {
  async function access<T>(
    write: boolean,
    work: (
      tx: WriteTx,
      account: typeof sponsorAccounts.$inferSelect,
      owner: string,
    ) => Promise<SponsorshipResult<T>>,
  ): Promise<SponsorshipResult<T>> {
    const owner = await deps.owner();
    if (!owner)
      return {
        ok: false,
        code: "unauthenticated",
        message: "Sign in with your sponsor identity.",
      };
    const result = await withSponsorWrite(async (tx) => {
      await lockSponsorOwner(tx, owner, "read");
      const [account] = await tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, owner))
        .for("update");
      if (
        !account ||
        (write && !["active", "recovery"].includes(account.state))
      )
        return denied("forbidden", "Your sponsorship history is read-only.");
      return work(tx, account, owner);
    });
    if (write && result.ok) revalidateTag(SPONSOR_CACHE_TAG, { expire: 0 });
    return result;
  }
  async function owned(
    tx: WriteTx,
    accountId: string,
    owner: string,
    id: string,
  ) {
    const [row] = await tx
      .select()
      .from(sponsors)
      .where(
        and(
          eq(sponsors.id, id),
          eq(sponsors.accountId, accountId),
          eq(sponsors.ownerUserId, owner),
          isNull(sponsors.deletedAt),
        ),
      );
    return row;
  }
  async function view(
    tx: WriteTx,
    row: typeof sponsors.$inferSelect,
  ): Promise<OwnedCampaign> {
    const [version] = await tx
      .select()
      .from(sponsorCampaignVersions)
      .where(
        and(
          eq(sponsorCampaignVersions.campaignId, row.id),
          eq(sponsorCampaignVersions.revision, row.revision),
        ),
      );
    if (!version) throw new Error("Campaign version unavailable.");
    // Keep this field for the existing editor DTO; it is never billing authority.
    const [checkout] = await tx
      .select({ id: sponsorCheckouts.id })
      .from(sponsorCheckouts)
      .where(
        and(
          eq(sponsorCheckouts.ownerUserId, row.ownerUserId!),
          eq(sponsorCheckouts.state, "completed"),
        ),
      )
      .limit(1);
    return {
      id: row.id,
      checkoutId: checkout?.id ?? "",
      versionId: version.id,
      revision: row.revision,
      state: row.campaignState as OwnedCampaign["state"],
      expiresAt: "",
      creative: version.creative,
    };
  }
  async function canPublish(
    tx: WriteTx,
    account: typeof sponsorAccounts.$inferSelect,
  ) {
    if (
      account.state !== "active" ||
      !account.paidThrough ||
      account.paidThrough <= deps.now()
    )
      return false;
    const [seat] = await tx
      .select()
      .from(sponsorSeats)
      .where(
        and(
          eq(sponsorSeats.accountId, account.id),
          eq(sponsorSeats.state, "occupied"),
        ),
      );
    return Boolean(seat);
  }
  async function freezeVersion(
    tx: WriteTx,
    owner: string,
    campaignId: string,
    revision: number,
    creative: CreativeSnapshot,
    versionId = randomUUID(),
  ) {
    await tx
      .insert(sponsorCampaignVersions)
      .values({
        id: versionId,
        campaignId,
        ownerUserId: owner,
        revision,
        creative,
      });
    await tx
      .insert(sponsorVersionAssets)
      .values(
        creative.assets.map((a) => ({
          versionId,
          assetId: a.id,
          ownerUserId: owner,
        })),
      );
    return versionId;
  }
  return {
    list: () =>
      access<CampaignList>(false, async (tx, account, owner) => {
        const rows = await tx
          .select()
          .from(sponsors)
          .where(
            and(
              eq(sponsors.accountId, account.id),
              eq(sponsors.ownerUserId, owner),
              isNull(sponsors.deletedAt),
            ),
          )
          .orderBy(sponsors.createdAt);
        return {
          ok: true,
          value: {
            campaigns: await Promise.all(rows.map((row) => view(tx, row))),
            readonly: account.state === "inactive",
          },
        };
      }),
    read: (id: string) =>
      access<OwnedCampaign>(false, async (tx, account, owner) => {
        const row = await owned(tx, account.id, owner, id);
        return row
          ? { ok: true, value: await view(tx, row) }
          : denied("forbidden", "Owned campaign not found.");
      }),
    save: (id: string | null, raw: unknown) =>
      access<OwnedCampaign>(true, async (tx, account, owner) => {
        const parsed = campaignInputSchema.safeParse(raw);
        if (!parsed.success)
          return denied(
            "invalid_input",
            parsed.error.issues[0]?.message ?? "Check campaign fields.",
          );
        const row = id ? await owned(tx, account.id, owner, id) : null;
        if (id && !row) return denied("forbidden", "Owned campaign not found.");
        if (parsed.data.expectedRevision !== (row?.revision ?? 0))
          return denied("conflict", "Campaign changed. Reload before saving.");
        const creative = await resolveSponsorCreative(
          parsed.data,
          async (assetId) => {
            const [asset] = await tx
              .select()
              .from(sponsorAssets)
              .where(
                and(
                  eq(sponsorAssets.id, assetId),
                  eq(sponsorAssets.ownerUserId, owner),
                  eq(sponsorAssets.state, "verified"),
                  sql`(${sponsorAssets.expiresAt} > ${deps.now()} or exists (select 1 from sponsor_version_assets where asset_id = ${sponsorAssets.id}))`,
                ),
              );
            return asset ? assetView(asset as SponsorUpload) : null;
          },
        );
        if (!creative.ok) return creative;
        if (
          row?.campaignState === "published" &&
          !(await canPublish(tx, account))
        )
          return denied(
            "forbidden",
            "Promotion is paused. Recover billing before saving public changes.",
          );
        const campaignId = row?.id ?? randomUUID(),
          versionId = randomUUID(),
          revision = (row?.revision ?? 0) + 1;
        let publicFields = {};
        if (row?.campaignState === "published") {
          const uploads = await tx
            .select()
            .from(sponsorAssets)
            .where(
              and(
                eq(sponsorAssets.ownerUserId, owner),
                inArray(
                  sponsorAssets.id,
                  creative.value.assets.map((a) => a.id),
                ),
              ),
            );
          publicFields = sponsorPublicCreative(
            creative.value,
            await deps.promote({
              accountId: account.id,
              campaignId,
              versionId,
              creative: creative.value,
              uploads: uploads as SponsorUpload[],
            }),
          );
          if (!(await canPublish(tx, account)))
            return denied(
              "forbidden",
              "The paid period ended. Recover billing before saving public changes.",
            );
        }
        const values = {
          title: creative.value.title,
          url: creative.value.url,
          tagline: creative.value.tagline,
          internalName: creative.value.title,
          revision,
          updatedAt: deps.now(),
          ...publicFields,
        };
        if (row)
          await tx
            .update(sponsors)
            .set(values)
            .where(eq(sponsors.id, campaignId));
        else
          await tx
            .insert(sponsors)
            .values({
              ...values,
              id: campaignId,
              ownerUserId: owner,
              accountId: account.id,
              campaignState: "draft",
              isActive: false,
              mediaWidth: 1200,
              mediaHeight: 800,
            });
        await freezeVersion(
          tx,
          owner,
          campaignId,
          revision,
          creative.value,
          versionId,
        );
        return {
          ok: true,
          value: await view(
            tx,
            (await owned(tx, account.id, owner, campaignId))!,
          ),
        };
      }),
    publish: (id: string, revision: number) =>
      access<OwnedCampaign>(true, async (tx, account, owner) => {
        const row = await owned(tx, account.id, owner, id);
        if (!row) return denied("forbidden", "Owned campaign not found.");
        if (row.revision !== revision)
          return denied(
            "conflict",
            "Campaign changed. Reload before publishing.",
          );
        if (!(await canPublish(tx, account)))
          return denied(
            "forbidden",
            "An active paid seat is required to make a campaign public.",
          );
        if (row.campaignState === "published")
          return { ok: true, value: await view(tx, row) };
        const campaign = await view(tx, row);
        const versionId = randomUUID(),
          nextRevision = row.revision + 1;
        const uploads = await tx
          .select()
          .from(sponsorAssets)
          .where(
            and(
              eq(sponsorAssets.ownerUserId, owner),
              eq(sponsorAssets.state, "verified"),
              inArray(
                sponsorAssets.id,
                campaign.creative.assets.map((a) => a.id),
              ),
            ),
          );
        const fields = sponsorPublicCreative(
          campaign.creative,
          await deps.promote({
            accountId: account.id,
            campaignId: id,
            versionId,
            creative: campaign.creative,
            uploads: uploads as SponsorUpload[],
          }),
        );
        // Storage may take time: check the entitlement again before committing.
        if (!(await canPublish(tx, account)))
          return denied(
            "forbidden",
            "The paid period ended. Recover billing before publishing.",
          );
        const current = await tx
          .select()
          .from(sponsors)
          .where(
            and(
              eq(sponsors.accountId, account.id),
              eq(sponsors.campaignState, "published"),
            ),
          );
        for (const previous of current) {
          const snapshot = await view(tx, previous);
          await freezeVersion(
            tx,
            owner,
            previous.id,
            previous.revision + 1,
            snapshot.creative,
          );
          await tx
            .update(sponsors)
            .set({
              campaignState: "archived",
              revision: previous.revision + 1,
              updatedAt: deps.now(),
            })
            .where(eq(sponsors.id, previous.id));
        }
        await freezeVersion(
          tx,
          owner,
          id,
          nextRevision,
          campaign.creative,
          versionId,
        );
        await tx
          .update(sponsors)
          .set({
            ...fields,
            campaignState: "published",
            revision: nextRevision,
            updatedAt: deps.now(),
          })
          .where(eq(sponsors.id, id));
        return {
          ok: true,
          value: {
            ...campaign,
            versionId,
            revision: nextRevision,
            state: "published",
          },
        };
      }),
    remove: (id: string, revision: number) =>
      access<{ deleted: true }>(true, async (tx, account, owner) => {
        const row = await owned(tx, account.id, owner, id);
        if (!row) return denied("forbidden", "Owned campaign not found.");
        if (row.revision !== revision)
          return denied(
            "conflict",
            "Campaign changed. Reload before deleting.",
          );
        if (row.campaignState === "published")
          return denied(
            "conflict",
            "Make another campaign public before deleting this one.",
          );
        // Versions/assets remain referenced for history and reference-safe retention.
        await tx
          .update(sponsors)
          .set({ deletedAt: deps.now(), updatedAt: deps.now() })
          .where(eq(sponsors.id, id));
        return { ok: true, value: { deleted: true } };
      }),
  };
}
