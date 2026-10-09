import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
export const SPONSOR_INTENT_COOKIE = "inspora_sponsor_flow";
export function signSponsorIntent(
  secret: string,
  expiresAt: number,
  owner: string | null = null,
) {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt, owner, nonce: randomUUID() }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret)
      .update("sponsor-flow:" + payload)
      .digest("base64url")
  );
}
export function verifySponsorIntent(
  token: string | undefined,
  secret: string | undefined,
  now: number,
  owner: string | null,
) {
  if (!token || !secret || token.length > 1024) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", secret)
    .update("sponsor-flow:" + payload)
    .digest();
  const received = Buffer.from(signature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(expected, received)
  )
    return false;
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return (
      Number.isFinite(value.expiresAt) &&
      value.expiresAt > now &&
      value.expiresAt <= now + 86400000 &&
      (value.owner === null || value.owner === owner)
    );
  } catch {
    return false;
  }
}
export async function hasSponsorIntent(owner: string | null) {
  return verifySponsorIntent(
    (await cookies()).get(SPONSOR_INTENT_COOKIE)?.value,
    process.env.CLERK_SECRET_KEY,
    Date.now(),
    owner,
  );
}
