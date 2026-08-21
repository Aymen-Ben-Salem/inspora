import { z } from "zod";

import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminSponsorInput } from "./types";

function isValidAssetUrl(value: string) {
  if (value.startsWith("/")) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const localOrRemoteAssetUrl = z
  .string()
  .trim()
  .refine(isValidAssetUrl, "Use a local path or a valid web image URL.");

const targetDestinationUrl = z
  .string()
  .trim()
  .url("A valid website URL is required (e.g. https://example.com).");

const optionalAssetUrl = z
  .union([z.literal(""), localOrRemoteAssetUrl])
  .optional()
  .transform((value) => value || undefined);

const optionalTagline = z
  .string()
  .trim()
  .max(300, "Tagline cannot exceed 300 characters.")
  .optional()
  .transform((value) => value || undefined);

const imageVariantSchema = z.object({
  url: localOrRemoteAssetUrl,
  storageKey: z.string().trim().min(1).max(1024),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  format: z.literal("webp"),
});

export const sponsorInputSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
    title: z.string().trim().min(1, "Title is required.").max(160, "Title is too long."),
    url: targetDestinationUrl,
    tagline: optionalTagline,
    mediaType: z.enum(["image", "video"]).default("image"),
    mediaUrl: optionalAssetUrl,
    mediaPosterUrl: optionalAssetUrl,
    mediaStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    mediaStorageKey: z.string().trim().min(1).max(1024).optional(),
    mediaPosterStorageKey: z.string().trim().min(1).max(1024).optional(),
    mediaWidth: z.coerce.number().int().positive().default(1200),
    mediaHeight: z.coerce.number().int().positive().default(800),
    mediaVariants: z.array(imageVariantSchema).default([]),
    mediaAlt: z.string().trim().max(300).default(""),
    iconUrl: optionalAssetUrl,
    iconStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    iconStorageKey: z.string().trim().min(1).max(1024).optional(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (sponsor) =>
      !sponsor.mediaStorageProvider ||
      (sponsor.mediaStorageProvider === "r2" && Boolean(sponsor.mediaStorageKey)),
    {
      message: "Media storage keys are required for R2-hosted media.",
      path: ["mediaStorageKey"],
    },
  )
  .refine(
    (sponsor) =>
      !sponsor.iconStorageProvider ||
      (sponsor.iconStorageProvider === "r2" && Boolean(sponsor.iconStorageKey)),
    {
      message: "Icon storage key is required for R2-hosted icons.",
      path: ["iconStorageKey"],
    },
  );

export function parseAdminSponsorForm(formData: FormData): AdminSponsorInput {
  const rawVariants = formData.get("mediaVariants");
  let parsedVariants: unknown[] = [];
  if (typeof rawVariants === "string" && rawVariants.trim().length > 0) {
    try {
      parsedVariants = JSON.parse(rawVariants);
    } catch {}
  }

  const rawActive = formData.get("isActive");
  const isActive = rawActive === "true" || rawActive === "on";

  return sponsorInputSchema.parse({
    id: formData.get("id") ?? undefined,
    title: formData.get("title"),
    url: formData.get("url"),
    tagline: formData.get("tagline") ?? undefined,
    mediaType: formData.get("mediaType") || "image",
    mediaUrl: formData.get("mediaUrl") ?? undefined,
    mediaPosterUrl: formData.get("mediaPosterUrl") ?? undefined,
    mediaStorageProvider: formData.get("mediaStorageProvider") || undefined,
    mediaStorageKey: formData.get("mediaStorageKey") || undefined,
    mediaPosterStorageKey: formData.get("mediaPosterStorageKey") || undefined,
    mediaWidth: formData.get("mediaWidth") || 1200,
    mediaHeight: formData.get("mediaHeight") || 800,
    mediaVariants: parsedVariants,
    mediaAlt: formData.get("mediaAlt") ?? "",
    iconUrl: formData.get("iconUrl") ?? undefined,
    iconStorageProvider: formData.get("iconStorageProvider") || undefined,
    iconStorageKey: formData.get("iconStorageKey") || undefined,
    isActive,
  });
}
