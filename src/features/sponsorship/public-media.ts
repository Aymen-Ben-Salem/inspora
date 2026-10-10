import "server-only";
import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createR2Client } from "@/storage/r2-client";
import { getR2PublicUrl } from "@/storage/r2";
import { privateSponsorStorage } from "@/storage/private-sponsor-assets";
import type { CreativeSnapshot, SponsorUpload } from "./types";
import { createSponsorPublicAssetKey } from "./public-media-key";
export type PublicSponsorAsset = { id: string; key: string; url: string };
export type SponsorPromoter = (input: {
  accountId: string;
  campaignId: string;
  versionId: string;
  creative: CreativeSnapshot;
  uploads: SponsorUpload[];
}) => Promise<PublicSponsorAsset[]>;
// A deterministic immutable key makes partial promotion and retries safe. Originals
// remain private; every derivative is verified again against the frozen digest.
export const promoteSponsorMedia: SponsorPromoter = async (input) => {
  const env = process.env;
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  )
    throw new Error("Public sponsor storage unavailable.");
  const client = createR2Client({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  try {
    const result: PublicSponsorAsset[] = [];
    for (const asset of input.creative.assets.filter(
      (a) => a.kind !== "original",
    )) {
      const upload = input.uploads.find((u) => u.id === asset.id);
      if (
        !upload?.objectKey ||
        upload.state !== "verified" ||
        upload.digest !== asset.digest
      )
        throw new Error("Verified sponsor derivative unavailable.");
      const stored = await privateSponsorStorage().read(upload.objectKey);
      if (
        !stored ||
        stored.bytes.byteLength !== asset.sizeBytes ||
        createHash("sha256").update(stored.bytes).digest("hex") !== asset.digest
      )
        throw new Error("Sponsor media digest mismatch.");
      const key = createSponsorPublicAssetKey({
        accountId: input.accountId,
        campaignId: input.campaignId,
        versionId: input.versionId,
        asset,
      });
      const url = getR2PublicUrl(key); // Also validates the approved environment before writing.
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
            Body: stored.bytes,
            ContentType: asset.contentType,
            CacheControl: "public, max-age=31536000, immutable",
            IfNoneMatch: "*",
          }),
        );
      } catch (e) {
        if (
          (e as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode !== 412
        )
          throw e;
      }
      const publicObject = await client.send(
        new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
      );
      const bytes = await publicObject.Body?.transformToByteArray();
      if (
        !bytes ||
        createHash("sha256").update(bytes).digest("hex") !== asset.digest
      )
        throw new Error("Public sponsor media verification failed.");
      result.push({ id: asset.id, key, url });
    }
    return result;
  } finally {
    client.destroy();
  }
};
export async function deleteSponsorPublicKeys(
  accountId: string,
  keys: string[],
) {
  if (!keys.length) return;
  const env = process.env;
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  )
    throw new Error("Sponsor media cleanup unavailable.");
  const client = createR2Client({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  try {
    for (const key of new Set(keys)) {
      if (!key.startsWith(`sponsorships/${accountId}/`) || key.includes(".."))
        throw new Error("Foreign sponsor media cleanup denied.");
      getR2PublicUrl(key);
      await client.send(
        new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
      );
    }
  } finally {
    client.destroy();
  }
}
