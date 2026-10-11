import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { sponsorAccounts, sponsorAssets, sponsorCheckouts } from "@/db/schema";
import {
  privateSponsorStorage,
  createSponsorStagingKey,
} from "@/storage/private-sponsor-assets";
import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
} from "@/features/media/upload-policy";
import { verifiedSponsorOwner } from "./authorization";
import { sponsorshipWritesEnabled } from "./config";
import { inspectSponsorMedia } from "./media-inspection";
import {
  assetView,
  findOwnUpload,
  lockSponsorOwner,
  preparationTransaction,
  withSponsorWrite,
} from "./repository";
import type {
  SponsorAssetKind,
  SponsorUpload,
  VerifiedSponsorAsset,
} from "./types";

const uploadInput = z
  .object({
    kind: z.enum([
      "original",
      "media",
      "icon",
      "wordmark",
      "poster",
      "video-preview",
      "variant",
    ]),
    contentType: z.enum(ACCEPTED_MEDIA_MIME_TYPES),
    sizeBytes: z.number().int().positive(),
    sourceAssetId: z.uuid().optional(),
  })
  .strict();
async function withOwnMedia<T>(
  write: boolean,
  work: (input: {
    userId: string;
    tx: import("@/db/write-client").WriteTx;
    p: import("./types").SponsorPreparation;
    paid: boolean;
  }) => Promise<T>,
) {
  if (write && !sponsorshipWritesEnabled())
    throw new Error("Sponsor changes are unavailable.");
  const userId = await verifiedSponsorOwner(write ? "write" : "read");
  if (!userId) throw new Error("Verify sponsor access before uploading.");
  return withSponsorWrite(async (tx) => {
    await lockSponsorOwner(tx, userId, write ? "write" : "read");
    const [account] = await tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, userId));
    let p = await preparationTransaction(tx).findPreparation(userId);
    if (account) {
      const [completed] = await tx.select().from(sponsorCheckouts).where(and(eq(sponsorCheckouts.ownerUserId, userId), eq(sponsorCheckouts.state, "completed"))).limit(1);
      if (!completed) throw new Error("Paid upload context unavailable.");
      p = { id: completed.id, ownerUserId: userId, state: "preparing", revision: 0, campaign: null, expiresAt: new Date(Date.now() + 86400000) };
    }
    if (
      !p ||
      !["preparing", "ready"].includes(p.state) ||
      p.expiresAt <= new Date()
    )
      throw new Error("Your preparation expired. Start a new preparation.");
    return work({ userId, tx, p, paid: Boolean(account) });
  });
}
export async function requireSponsorMediaWriteAccess(): Promise<void> {
  await withOwnMedia(true, async () => {});
}
export async function beginSponsorUpload(raw: unknown) {
  const input = uploadInput.parse(raw);
  if (input.sizeBytes > getMediaUploadLimit(input.contentType))
    throw new Error("Images are limited to 10 MiB and videos to 50 MiB.");
  if (
    input.kind !== "original" &&
    input.kind !== "media" &&
    input.kind !== "video-preview" &&
    (!input.contentType.startsWith("image/") ||
      input.contentType === "image/gif")
  )
    throw new Error("Use a supported static raster image.");
  if (input.kind === "video-preview" && input.contentType !== "video/mp4")
    throw new Error("Video previews must be MP4.");
  return withOwnMedia(true, async ({ userId, tx, p, paid }) => {
    if (input.sourceAssetId) {
      const source = await findOwnUpload(tx, userId, input.sourceAssetId);
      if (
        input.kind === "original" ||
        !source ||
        source.kind !== "original" ||
        source.state !== "verified" ||
        source.checkoutId !== p.id ||
        (!paid && source.expiresAt <= new Date())
      )
        throw new Error(
          "Use a verified original from your own current preparation.",
        );
    }
    const count = await tx.execute(
      sql`select count(*)::int as count from sponsor_assets where checkout_id = ${p.id} and (${!paid} or not exists (select 1 from sponsor_version_assets where asset_id = sponsor_assets.id))`,
    );
    if (Number(count.rows[0]?.count) >= 40)
      throw new Error(
        "This preparation reached its upload limit. Save your current assets or start again after expiry.",
      );
    const id = randomUUID(),
      stagingKey = createSponsorStagingKey(userId, id, input.contentType);
    await tx.insert(sponsorAssets).values({
      ...input,
      id,
      ownerUserId: userId,
      checkoutId: p.id,
      stagingKey,
      expiresAt: p.expiresAt,
    });
    const ticket = await privateSponsorStorage().sign({
      ownerUserId: userId,
      uploadId: id,
      stagingKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return { id, ...ticket };
  });
}
export async function completeSponsorUpload(
  uploadId: string,
): Promise<VerifiedSponsorAsset> {
  z.uuid().parse(uploadId);
  return withOwnMedia(true, async ({ userId, tx, p }) => {
    const upload = await findOwnUpload(tx, userId, uploadId);
    if (
      !upload ||
      upload.checkoutId !== p.id ||
      upload.state === "deleting" ||
      upload.expiresAt <= new Date()
    )
      throw new Error("This upload is unavailable.");
    if (upload.state === "verified") return assetView(upload);
    const storage = privateSponsorStorage();
    const staged = await storage.read(upload.stagingKey);
    if (
      !staged ||
      staged.bytes.length !== upload.sizeBytes ||
      staged.contentType.split(";", 1)[0] !== upload.contentType
    )
      throw new Error("Uploaded bytes do not match the signed file.");
    const dimensions = await inspectSponsorMedia(
      staged.bytes,
      upload.contentType,
      upload.kind,
    );
    const frozen = await storage.freeze({
      ownerUserId: userId,
      uploadId: upload.id,
      kind:
        upload.kind === "original" ||
        upload.kind === "media" ||
        upload.kind === "video-preview"
          ? "design"
          : "logo",
      stagingKey: upload.stagingKey,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
    });
    if (
      frozen.digest !==
        (await import("node:crypto"))
          .createHash("sha256")
          .update(staged.bytes)
          .digest("hex") ||
      frozen.sizeBytes !== upload.sizeBytes ||
      frozen.contentType !== upload.contentType
    )
      throw new Error("Media changed during verification. Try a fresh upload.");
    if (p.expiresAt <= new Date())
      throw new Error("Preparation expired during verification.");
    const [row] = await tx
      .update(sponsorAssets)
      .set({
        state: "verified",
        objectKey: frozen.objectKey,
        digest: frozen.digest,
        ...dimensions,
      })
      .where(
        and(
          eq(sponsorAssets.id, upload.id),
          eq(sponsorAssets.ownerUserId, userId),
        ),
      )
      .returning();
    return assetView(row as SponsorUpload);
  });
}
export async function importSponsorSuggestion(
  bytes: Uint8Array,
  contentType: string,
  kind: SponsorAssetKind,
) {
  await inspectSponsorMedia(bytes, contentType, kind);
  const ticket = await beginSponsorUpload({
    kind,
    contentType,
    sizeBytes: bytes.length,
  });
  const response = await fetch(ticket.uploadUrl, {
    method: ticket.method,
    headers: ticket.headers,
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("Suggested image could not be stored.");
  return completeSponsorUpload(ticket.id);
}
export async function readOwnSponsorAsset(id: string) {
  z.uuid().parse(id);
  return withOwnMedia(false, async ({ userId, tx, p, paid }) => {
    const row = await findOwnUpload(tx, userId, id);
    if (
      !row ||
      (!paid && row.checkoutId !== p.id) ||
      row.state !== "verified" ||
      !row.objectKey ||
      (!paid && row.expiresAt <= new Date())
    )
      return null;
    return privateSponsorStorage().read(row.objectKey);
  });
}
