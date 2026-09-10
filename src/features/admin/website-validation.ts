import { z } from "zod";

import { WEBSITE_MEDIA_ROLES } from "../../domain/website";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminWebsiteInput } from "./types";

const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const MAX_SECTION_BYTES = 25 * 1024 * 1024;
const STATIC_IMAGE_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const RECORDING_TYPES = ["video/mp4", "video/webm"] as const;

function isAllowedAssetUrl(value: string) {
  if (value.startsWith("/")) return true;

  try {
    const url = new URL(value);
    let r2Hostname: string | undefined;
    try {
      r2Hostname = process.env.R2_PUBLIC_BASE_URL
        ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
        : undefined;
    } catch {}
    const allowedHostnames = new Set(
      ["images.unsplash.com", process.env.MEDIA_HOSTNAME, r2Hostname].filter(Boolean),
    );
    return url.protocol === "https:" && allowedHostnames.has(url.hostname);
  } catch {
    return false;
  }
}

const assetUrl = z.string().trim().refine(
  isAllowedAssetUrl,
  "Use a local path or an https URL from the configured media hostname.",
);
const optionalAssetUrl = z
  .union([z.literal(""), assetUrl])
  .optional()
  .transform((value) => value || undefined);
const optionalRemoteUrl = z
  .union([z.literal(""), z.url()])
  .transform((value) => value || undefined);

const creatorSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]).transform((value) => value || undefined),
    name: z.string().trim().min(1).max(160),
    handle: z.string().trim().max(160).optional(),
    url: optionalRemoteUrl,
    avatarUrl: assetUrl,
    avatarStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    avatarStorageKey: z.string().trim().min(1).max(1024).optional(),
  })
  .refine(
    (creator) =>
      Boolean(creator.avatarStorageProvider) === Boolean(creator.avatarStorageKey),
    "Managed creator avatars must include their storage provider and key.",
  );

const imageVariantSchema = z.object({
  url: assetUrl,
  storageKey: z.string().trim().min(1).max(1024),
  width: z.coerce.number().int().positive().max(12000),
  height: z.coerce.number().int().positive().max(12000),
  bytes: z.coerce.number().int().positive().max(MAX_SECTION_BYTES),
  format: z.literal("webp"),
});

const videoPreviewSchema = z.object({
  url: assetUrl,
  storageKey: z.string().trim().min(1).max(1024),
  width: z.coerce.number().int().positive().max(1080),
  height: z.coerce.number().int().positive().max(1920),
  bytes: z.coerce.number().int().positive().max(MAX_RECORDING_BYTES),
  format: z.literal("mp4"),
});

const websiteMediaSchema = z
  .object({
    role: z.enum(WEBSITE_MEDIA_ROLES),
    url: assetUrl,
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
  );

const sectionSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(120),
    alt: z.string().trim().min(1).max(500),
    url: assetUrl,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().max(MAX_SECTION_BYTES).optional(),
    variants: z.array(imageVariantSchema).max(4).optional(),
    width: z.coerce.number().int().min(1).max(12000),
    height: z.coerce.number().int().min(1).max(12000),
    position: z.coerce.number().int().min(0).max(29),
  })
  .refine(
    (section) => Boolean(section.storageProvider) === Boolean(section.storageKey),
    "Managed website sections must include their storage provider and key.",
  )
  .refine(
    (section) =>
      !section.mimeType || STATIC_IMAGE_TYPES.some((type) => type === section.mimeType),
    "Website sections must use a supported static image type.",
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
    sourceUrl: z.url(),
    isFeatured: z.boolean(),
    status: z.enum(["draft", "published"]),
    media: z.array(websiteMediaSchema).length(2),
    sections: z.array(sectionSchema).min(1).max(30),
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

    const ids = new Set(website.sections.map((section) => section.id));
    const positions = new Set(website.sections.map((section) => section.position));
    if (ids.size !== website.sections.length || positions.size !== website.sections.length) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Website sections must have unique identities and positions.",
      });
    }
    website.sections.forEach((section, index) => {
      if (section.position !== index) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "position"],
          message: "Website section positions must be contiguous and ordered.",
        });
      }
    });
  });

export function parseAdminWebsiteForm(formData: FormData): AdminWebsiteInput {
  let media: unknown = [];
  let sections: unknown = [];
  try {
    media = JSON.parse(String(formData.get("media") ?? "[]"));
    sections = JSON.parse(String(formData.get("sections") ?? "[]"));
  } catch {}

  return websiteSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    tagline: formData.get("tagline"),
    creator: {
      id: formData.get("creatorId"),
      name: formData.get("creatorName"),
      handle: String(formData.get("creatorHandle") ?? "") || undefined,
      url: formData.get("creatorUrl"),
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
    sourceUrl: formData.get("sourceUrl"),
    isFeatured: formData.get("isFeatured") === "on",
    status: formData.get("status"),
    media,
    sections,
  });
}