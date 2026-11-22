import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/auth/require-admin";
import { SPONSOR_CACHE_TAG } from "@/data/sponsor-repository";
import { adminAuditLogs, sponsorAccounts, sponsorPromotions, sponsors } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { withWriteTransaction } from "@/db/write-client";
import { requireSponsorActor } from "./authorization";
import { sponsorAccountCanWrite } from "./capabilities";
import { promoLabelSchema, type PromoLabel } from "./promo-label";

/** Account promotions with the public campaign they currently appear on. */
export type PromotionsView = {
  label: PromoLabel | null;
  revision: number;
  readonly: boolean;
  campaign: {
    title: string;
    url: string;
    mediaType: string;
    mediaUrl: string | null;
    mediaPosterUrl: string | null;
    mediaWidth: number;
    mediaHeight: number;
    iconUrl: string | null;
  } | null;
};
export type PromotionsResult =
  | { ok: true; value: PromotionsView }
  | { ok: false; code: "invalid_input" | "conflict" | "forbidden"; message: string };

export const promotionsInputSchema = z.object({
  label: promoLabelSchema.nullable(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

async function view(tx: WriteTx, accountId: string, readonly: boolean): Promise<PromotionsView> {
  const [row] = await tx.select().from(sponsorPromotions).where(eq(sponsorPromotions.accountId, accountId));
  const [campaign] = await tx
    .select({
      title: sponsors.title, url: sponsors.url, mediaType: sponsors.mediaType, mediaUrl: sponsors.mediaUrl,
      mediaPosterUrl: sponsors.mediaPosterUrl, mediaWidth: sponsors.mediaWidth, mediaHeight: sponsors.mediaHeight, iconUrl: sponsors.iconUrl,
    })
    .from(sponsors)
    .where(and(eq(sponsors.accountId, accountId), eq(sponsors.campaignState, "published"), isNull(sponsors.deletedAt)))
    .limit(1);
  return { label: row?.label ?? null, revision: row?.revision ?? 0, readonly, campaign: campaign ?? null };
}

/** Saves with optimistic concurrency, since the sponsor and admins can both edit. */
async function save(accountId: string, raw: unknown, updatedBy: string, readonly: boolean, audit?: string): Promise<PromotionsResult> {
  const parsed = promotionsInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Check the label." };
  if (readonly) return { ok: false, code: "forbidden", message: "Promotions are read-only after the paid period ends." };
  const result = await withWriteTransaction(async (tx): Promise<PromotionsResult> => {
    const [current] = await tx.select().from(sponsorPromotions).where(eq(sponsorPromotions.accountId, accountId)).for("update");
    if ((current?.revision ?? 0) !== parsed.data.expectedRevision)
      return { ok: false, code: "conflict", message: "Promotions changed elsewhere. Reload to see the latest version." };
    const values = { label: parsed.data.label, revision: parsed.data.expectedRevision + 1, updatedBy, updatedAt: new Date() };
    if (current) await tx.update(sponsorPromotions).set(values).where(eq(sponsorPromotions.accountId, accountId));
    else await tx.insert(sponsorPromotions).values({ accountId, ...values });
    if (audit)
      await tx.insert(adminAuditLogs).values({
        actorId: audit,
        action: "sponsor_promotions_update",
        resourceType: "sponsor",
        resourceId: accountId,
        details: { label: parsed.data.label, revision: values.revision },
      });
    return { ok: true, value: await view(tx, accountId, readonly) };
  });
  if (result.ok) revalidateTag(SPONSOR_CACHE_TAG, { expire: 0 });
  return result;
}

export async function readOwnPromotions() {
  const actor = await requireSponsorActor("read");
  return withWriteTransaction(tx => view(tx, actor.accountId, !sponsorAccountCanWrite(actor.state)));
}
export async function saveOwnPromotions(raw: unknown) {
  // Write access honors the sponsorship write switch and paused accounts.
  const actor = await requireSponsorActor("write");
  return save(actor.accountId, raw, actor.userId, !sponsorAccountCanWrite(actor.state));
}

async function adminAccount(accountId: string) {
  const admin = await requireAdmin();
  const id = z.uuid().parse(accountId);
  const [account] = await withWriteTransaction(tx =>
    tx.select({ id: sponsorAccounts.id, state: sponsorAccounts.state }).from(sponsorAccounts).where(eq(sponsorAccounts.id, id)));
  if (!account) throw new Error("Sponsor account unavailable.");
  return { admin, account };
}
export async function readAdminPromotions(accountId: string) {
  const { account } = await adminAccount(accountId);
  return withWriteTransaction(tx => view(tx, account.id, false));
}
export async function saveAdminPromotions(accountId: string, raw: unknown) {
  const { admin, account } = await adminAccount(accountId);
  // Admins may correct promotions for any account, including a paused one.
  return save(account.id, raw, admin.userId, false, admin.userId);
}
