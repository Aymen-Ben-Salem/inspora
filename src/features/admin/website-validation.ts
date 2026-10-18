import { z } from "zod";

import { WEBSITE_MEDIA_ROLES } from "../../domain/website";
import { creatorAvatarUrlSchema } from "../creators/avatar-url";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";
import { normalizeCreatorValidationInput } from "./creator-environment-policy";
import {
  imageUrlSchema,
  isAllowedManagedAssetUrl,
  managedAssetUrlSchema,
  MANAGED_ASSET_URL_ERROR,
} from "./media-url-validation";

import type { AdminWebsiteInput } from "./types";

const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const STATIC_IMAGE_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const RECORDING_TYPES = ["video/mp4", "video/webm"] as const;

const optionalAssetUrl = z
  .union([z.literal(""), managedAssetUrlSchema])
  .optional()
  .transform((value) => value || undefined);
const optionalRemoteUrl = z
  .union([z.literal(""), z.url()])
  .transform((value) => value || undefined);

const creatorSchema = z.preprocess(
  (input) => normalizeCreatorValidationInput(input, process.env.DATA_ENVIRONMENT),
  z
  .object({
    id: z.union([z.literal(""), z.uuid()]).transform((value) => value || undefined),
    name: z.string().trim().min(1).max(160),
    legacyHandle: z.string().trim().max(160).optional(),
    username: z.union([z.literal(""), z.string().regex(/^[a-z0-9_]{3,30}$/)]).optional().transform((value) => value || undefined),
    url: optionalRemoteUrl,
    xProfileUrl: optionalRemoteUrl,
    recordOrigin: z.enum(["mirrored", "preview", "development", "editorial", "user"]).optional(),
    avatarUrl: creatorAvatarUrlSchema,
    avatarStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    avatarStorageKey: z.string().trim().min(1).max(1024).optional(),
  })
  .refine(
    (creator) =>
      Boolean(creator.avatarStorageProvider) === Boolean(creator.avatarStorageKey),
    "Managed creator avatars must include their storage provider and key.",
  ),
);

const imageVariantSchema = z.object({
  url: managedAssetUrlSchema,
  storageKey: z.string().trim().min(1).max(1024),
  width: z.coerce.number().int().positive().max(12000),
  height: z.coerce.number().int().positive().max(12000),
  bytes: z.coerce.number().int().positive().max(MAX_IMAGE_BYTES),
  format: z.literal("webp"),
});

const videoPreviewSchema = z.object({
  url: managedAssetUrlSchema,
  storageKey: z.string().trim().min(1).max(1024),
  width: z.coerce.number().int().positive().max(1080),
  height: z.coerce.number().int().positive().max(1920),
  bytes: z.coerce.number().int().positive().max(MAX_RECORDING_BYTES),
  format: z.literal("mp4"),
});

const websiteMediaSchema = z
  .object({
    role: z.enum(WEBSITE_MEDIA_ROLES),
    url: imageUrlSchema,
    posterUrl: optionalAssetUrl,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().optional(),
    variants: z.array(imageVariantSchema).max(4).optional(),
    videoPreview: videoPreviewSchema.optional(),
    posterStorageKey: z.string().trim().min(1).max(1024).optional(),
    alt: z.string().trim().max(500),
    width: z.coerce.number().int().min(1).max(12000),
    height: z.coerce.number().int().min(1).max(12000),
  })
  .refine(
    (media) => Boolean(media.storageProvider) === Boolean(media.storageKey),
    "Managed website media must include its storage provider and key.",
  )
  .refine(
    (media) =>
      (media.role === "favicon" && !media.storageProvider) ||
      isAllowedManagedAssetUrl(media.url),
    { message: MANAGED_ASSET_URL_ERROR, path: ["url"] },
  );

function commaSeparated(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const websiteSchema = z
  .object({
    slug: z.string().trim().min(1).max(120).regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens.",
    ),
    title: z.string().trim().min(1).max(200),
    tagline: z.string().trim().min(1).max(300),
    creator: creatorSchema,
    description: z.string().trim().min(1).max(4000),
    categories: z.array(z.string().max(80)).min(1).max(30),
    themes: z.array(z.string().max(80)).min(1).max(30),
    colors: z.array(z.string().max(80)).min(1).max(30),
    technologies: z.array(z.string().max(80)).max(30),
    sourceUrl: z.url(),
    isFeatured: z.boolean(),
    status: z.enum(["draft", "published"]),
    media: z.array(websiteMediaSchema).length(2),
  })
  .superRefine((website, context) => {
    for (const role of WEBSITE_MEDIA_ROLES) {
      const matches = website.media.filter((media) => media.role === role);
      if (matches.length !== 1) {
        context.addIssue({
          code: "custom",
          path: ["media"],
          message: `Add exactly one ${role === "recording" ? "website recording" : "favicon"}.`,
        });
      }
    }

    const recording = website.media.find((media) => media.role === "recording");
    if (recording) {
      const recordingType = recording.mimeType ?? recording.sourceMimeType;
      if (!recordingType || !RECORDING_TYPES.some((type) => type === recordingType)) {
        context.addIssue({
          code: "custom",
          path: ["media", website.media.indexOf(recording), "mimeType"],
          message: "Website recordings must be MP4 or WebM video.",
        });
      }
      if (recording.sizeBytes && recording.sizeBytes > MAX_RECORDING_BYTES) {
        context.addIssue({
          code: "custom",
          path: ["media", website.media.indexOf(recording), "sizeBytes"],
          message: "Website recordings must not exceed 50 MiB.",
        });
      }
      if (
        recording.storageProvider !== "r2" ||
        !recording.videoPreview ||
        !recording.posterUrl ||
        !recording.posterStorageKey
      ) {
        context.addIssue({
          code: "custom",
          path: ["media", website.media.indexOf(recording)],
          message: "A managed recording requires its verified preview and poster.",
        });
      }
    }

    const favicon = website.media.find((media) => media.role === "favicon");
    if (
      favicon?.mimeType &&
      !STATIC_IMAGE_TYPES.some((type) => type === favicon.mimeType)
    ) {
      context.addIssue({
        code: "custom",
        path: ["media", website.media.indexOf(favicon), "mimeType"],
        message: "Favicons must use a supported static image type.",
      });
    }
  });

export function parseAdminWebsiteForm(formData: FormData): AdminWebsiteInput {
  let media: unknown = [];
  try {
    media = JSON.parse(String(formData.get("media") ?? "[]"));
  } catch {}

  return websiteSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    tagline: formData.get("tagline"),
    creator: {
      id: formData.get("creatorId"),
      name: formData.get("creatorName"),
      legacyHandle: String(formData.get("creatorHandle") ?? "") || undefined,
      username: String(formData.get("creatorUsername") ?? "") || undefined,
      url: formData.get("creatorUrl"),
      xProfileUrl: String(formData.get("creatorXProfileUrl") ?? ""),
      recordOrigin: String(formData.get("creatorRecordOrigin") ?? "") || undefined,
      avatarUrl: formData.get("creatorAvatarUrl"),
      avatarStorageProvider:
        String(formData.get("creatorAvatarStorageProvider") ?? "") || undefined,
      avatarStorageKey:
        String(formData.get("creatorAvatarStorageKey") ?? "") || undefined,
    },
    description: formData.get("description"),
    categories: commaSeparated(formData.get("categories")),
    themes: commaSeparated(formData.get("themes")),
    colors: commaSeparated(formData.get("colors")),
    technologies: commaSeparated(formData.get("technologies")),
    sourceUrl: formData.get("sourceUrl"),
    isFeatured: formData.get("isFeatured") === "on",
    status: formData.get("status"),
    media,
  });
}
