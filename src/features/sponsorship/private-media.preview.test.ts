import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { privateSponsorStorage } from "@/storage/private-sponsor-assets";
it("verifies actual preview private storage signing, frozen bytes and exact-key cleanup", async () => {
  const storage = privateSponsorStorage();
  const ownerUserId = "sponsor-private-rehearsal-" + randomUUID(),
    uploadId = randomUUID();
  const bytes = await sharp({
    create: { width: 64, height: 32, channels: 4, background: "green" },
  })
    .png()
    .toBuffer();
  const prepared = await storage.prepare({
    ownerUserId,
    uploadId,
    contentType: "image/png",
    sizeBytes: bytes.length,
  });
  let frozenKey: string | undefined;
  try {
    const put = await fetch(prepared.ticket.uploadUrl, {
      method: prepared.ticket.method,
      headers: prepared.ticket.headers,
      body: bytes,
      signal: AbortSignal.timeout(10000),
    });
    expect(put.ok).toBe(true);
    const frozen = await storage.freeze({
      ownerUserId,
      uploadId,
      stagingKey: prepared.stagingKey,
      kind: "logo",
      contentType: "image/png",
      sizeBytes: bytes.length,
    });
    frozenKey = frozen.objectKey;
    expect(frozen.digest).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const stored = await storage.read(frozen.objectKey);
    expect(stored?.bytes).toEqual(bytes);
    expect(stored?.cacheControl).toBe("private, no-store");
    expect(await storage.read(prepared.stagingKey)).toBeNull();
  } finally {
    await storage.delete(prepared.stagingKey);
    if (frozenKey) await storage.delete(frozenKey);
  }
});
