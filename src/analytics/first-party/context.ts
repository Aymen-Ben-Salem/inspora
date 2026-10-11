import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isPrivateAnalyticsPath } from "@/analytics/privacy";
import { AnalyticsInputError } from "./collector";
import type { DeliveryContext } from "./types";
export function analyticsEncryptionKey() {
  const secret = process.env.ANALYTICS_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Analytics is unavailable.");
  return createHash("sha256").update(secret).digest();
}
export function publicAnalyticsPath(path: string) {
  if (!/^\/(?!\/)[^?#\\\s]{0,240}$/.test(path) || isPrivateAnalyticsPath(path))
    throw new AnalyticsInputError("Public path required.");
  return path;
}
const contextSchema = z
  .object({
    pageId: z.uuid(),
    path: z.string(),
    issuedAt: z.number().int(),
    expiresAt: z.number().int(),
    campaignId: z.uuid().optional(),
    versionId: z.uuid().optional(),
    placement: z.enum(["header", "feed", "detail"]).optional(),
    previewVideo: z.boolean().optional(),
    referrerDomain: z.string().max(253).optional(),
  })
  .strict();
export function issueDeliveryToken(context: DeliveryContext) {
  const body = Buffer.from(JSON.stringify(context)).toString("base64url");
  const signature = createHmac("sha256", analyticsEncryptionKey())
    .update("placement:" + body)
    .digest("base64url");
  return `${body}.${signature}`;
}
export function decodeDeliveryToken(token: string): DeliveryContext {
  const [body, sig, ...extra] = token.split(".");
  if (!body || !sig || extra.length)
    throw new AnalyticsInputError("Invalid delivery token.");
  const expected = createHmac("sha256", analyticsEncryptionKey())
    .update("placement:" + body)
    .digest();
  const signature = Buffer.from(sig, "base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    throw new AnalyticsInputError("Invalid delivery token.");
  let context: DeliveryContext;
  try {
    context = contextSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );
  } catch {
    throw new AnalyticsInputError("Invalid delivery token.");
  }
  publicAnalyticsPath(context.path);
  if (
    context.expiresAt <= context.issuedAt ||
    context.expiresAt - context.issuedAt > 300000 ||
    Boolean(context.campaignId) !==
      Boolean(context.versionId && context.placement)
  )
    throw new AnalyticsInputError("Invalid delivery token.");
  return context;
}
