import { createHash, randomUUID } from "node:crypto";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { privateSponsorStorage } from "@/storage/private-sponsor-assets";
import { createR2Client } from "@/storage/r2-client";
import { deleteSponsorPublicKeys, promoteSponsorMedia } from "./public-media";
import type {
  CreativeSnapshot,
  SponsorUpload,
  VerifiedSponsorAsset,
} from "./types";
it("promotes and retries actual preview immutable derivatives while retaining originals privately", async () => {
  const storage = privateSponsorStorage(),
    owner = `sponsor-public-rehearsal-${randomUUID()}`;
  const accountId = randomUUID(),
    campaignId = randomUUID(),
    versionId = randomUUID(),
    checkoutId = randomUUID();
  const uploads: SponsorUpload[] = [],
    assets: VerifiedSponsorAsset[] = [],
    privateKeys: string[] = [],
    publicKeys: string[] = [];
  const client = createR2Client({
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  });
  try {
    for (const kind of ["original", "icon", "wordmark"] as const) {
      const id = randomUUID(),
        bytes = await sharp({
          create: { width: 64, height: 32, channels: 4, background: "green" },
        })
          .png()
          .toBuffer();
      const prepared = await storage.prepare({
        ownerUserId: owner,
        uploadId: id,
        contentType: "image/png",
        sizeBytes: bytes.length,
      });
      privateKeys.push(prepared.stagingKey);
      const put = await fetch(prepared.ticket.uploadUrl, {
        method: prepared.ticket.method,
        headers: prepared.ticket.headers,
        body: bytes,
        signal: AbortSignal.timeout(10000),
      });
      expect(put.ok).toBe(true);
      const frozen = await storage.freeze({
        ownerUserId: owner,
        uploadId: id,
        stagingKey: prepared.stagingKey,
        kind: "logo",
        contentType: "image/png",
        sizeBytes: bytes.length,
      });
      privateKeys.push(frozen.objectKey);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(frozen.digest).toBe(digest);
      uploads.push({
        id,
        ownerUserId: owner,
        checkoutId,
        kind,
        state: "verified",
        contentType: "image/png",
        sizeBytes: bytes.length,
        stagingKey: prepared.stagingKey,
        objectKey: frozen.objectKey,
        digest,
        width: 64,
        height: 32,
        expiresAt: new Date(Date.now() + 86400000),
      });
      assets.push({
        id,
        kind,
        contentType: "image/png",
        sizeBytes: bytes.length,
        width: 64,
        height: 32,
        digest,
        url: `/api/sponsorship/assets/${id}`,
      });
      publicKeys.push(
        `sponsorships/${accountId}/${campaignId}/${versionId}/${id}.png`,
      );
    }
    const creative: CreativeSnapshot = {
      title: "Disposable promotion fixture",
      url: "https://example.invalid",
      tagline: "",
      iconId: assets[1].id,
      wordmarkId: assets[2].id,
      variantIds: [],
      assets,
    };
    const input = { accountId, campaignId, versionId, creative, uploads };
    const first = await promoteSponsorMedia(input),
      retried = await promoteSponsorMedia(input);
    expect(first.map((a) => a.id)).toEqual([assets[1].id, assets[2].id]);
    expect(retried).toEqual(first);
    await expect(
      client.send(
        new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: publicKeys[0],
        }),
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    expect((await storage.read(uploads[0].objectKey!))?.bytes.byteLength).toBe(
      assets[0].sizeBytes,
    );
    const corrupted = {
      ...input,
      creative: {
        ...creative,
        assets: creative.assets.map((a) =>
          a.kind === "icon" ? { ...a, digest: "0".repeat(64) } : a,
        ),
      },
      uploads: uploads.map((a) =>
        a.kind === "icon" ? { ...a, digest: "0".repeat(64) } : a,
      ),
    };
    await expect(promoteSponsorMedia(corrupted)).rejects.toThrow(
      "digest mismatch",
    );
  } finally {
    client.destroy();
    await deleteSponsorPublicKeys(accountId, publicKeys);
    for (const key of privateKeys) await storage.delete(key);
  }
});
