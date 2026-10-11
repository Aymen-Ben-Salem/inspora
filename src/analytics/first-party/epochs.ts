import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { withWriteTransaction } from "@/db/write-client";
import { analyticsIdentityEpochs } from "@/db/schema";
import { analyticsEncryptionKey } from "./context";
export async function readIdentityEpoch(
  month: string,
  now: Date,
): Promise<Buffer> {
  const current = now.toISOString().slice(0, 7),
    previous = new Date(now);
  previous.setUTCDate(1);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  if (month !== current && month !== previous.toISOString().slice(0, 7))
    throw new Error("Identity epoch unavailable.");
  return withWriteTransaction(async (tx) => {
    const key = analyticsEncryptionKey();
    const secret = randomBytes(32),
      iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(month));
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCHours(1);
    if (month === current)
      await tx
        .insert(analyticsIdentityEpochs)
        .values({
          month,
          encryptedSecret: Buffer.concat([
            iv,
            cipher.getAuthTag(),
            encrypted,
          ]).toString("base64"),
          destroyAt: next,
        })
        .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(analyticsIdentityEpochs)
      .where(eq(analyticsIdentityEpochs.month, month));
    if (!row || row.destroyAt <= now)
      throw new Error("Identity epoch unavailable.");
    const bytes = Buffer.from(row.encryptedSecret, "base64"),
      decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(month));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]);
  });
}
