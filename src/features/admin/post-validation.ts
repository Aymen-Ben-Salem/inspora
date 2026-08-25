import { z } from "zod";

import { POST_CATEGORIES } from "../../domain/post";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminPostInput } from "./types";

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
      [
        "images.unsplash.com",
        process.env.MEDIA_HOSTNAME,
        r2Hostname,
      ].filter(Boolean),
    );
    return url.protocol === "https:" && allowedHostnames.has(url.hostname);
  } catch {
    return false;
  }
}

const localOrRemoteUrl = z
  .string()
  .trim()
  .refine(
    isAllowedAssetUrl,
    "Use a local path or an https URL from the configured media hostname.",
  );

const optionalRemoteUrl = z
  .union([z.literal(""), z.url()])
  .transform((value) => value || undefined);

const optionalAssetUrl = z
  .union([z.literal(""), localOrRemoteUrl])
  .optional()
  .transform((value) => value || undefined);

const creatorSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]).transform((value) => value || undefined),
    name: z.string().trim().min(1).max(160),
    handle: z.string().trim().max(160).optional(),
    url: optionalRemoteUrl,
    avatarUrl: localOrRemoteUrl,
    avatarStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    avatarStorageKey: z.string().trim().min(1).max(1024).optional(),
  })
  .refine(
    (creator) =>
      Boolean(creator.avatarStorageProvider) === Boolean(creator.avatarStorageKey),
    "Managed creator avatars must include their storage provider and key.",
  );

const mediaSchema = z
  .object({
    type: z.enum(["image", "video"]),
    url: localOrRemoteUrl,
    posterUrl: optionalAssetUrl,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().optional(),
    variants: z
      .array(
        z.object({
          url: localOrRemoteUrl,
          storageKey: z.string().trim().min(1).max(1024),
          width: z.coerce.number().int().positive().max(12000),
          height: z.coerce.number().int().positive().max(12000),
          bytes: z.coerce.number().int().positive(),
          format: z.literal("webp"),
        }),
      )
      .max(4)
      .optional(),
    videoPreview: z
      .object({
        url: localOrRemoteUrl,
        storageKey: z.string().trim().min(1).max(1024),
        width: z.coerce.number().int().positive().max(1080),
        height: z.coerce.number().int().positive().max(1920),
        bytes: z.coerce.number().int().positive(),
        format: z.literal("mp4"),
      })
      .optional(),
    posterStorageKey: z.string().trim().min(1).max(1024).optional(),
    alt: z.string().trim().max(500),
    width: z.coerce.number().int().min(1).max(12000),
    height: z.coerce.number().int().min(1).max(12000),
  })
  .refine(
    (media) => Boolean(media.storageProvider) === Boolean(media.storageKey),
    "Managed media must include its storage provider and key.",
  )
  .refine(
    (media) => !media.posterStorageKey || media.storageProvider === "r2",
    "Managed poster keys are only valid for R2 media.",
  )
  .refine(
    (media) =>
      !media.videoPreview ||
      (media.type === "video" && media.storageProvider === "r2"),
    "Feed video previews are only valid for managed R2 videos.",
  );

function commaSeparated(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const postSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  title: z.string().trim().min(1).max(200),
  creator: creatorSchema,
  description: z.string().trim().min(1).max(4000),
  category: z.enum(POST_CATEGORIES),
  industries: z.array(z.string().max(80)).max(30),
  colors: z.array(z.string().max(80)).max(30),
  styles: z.array(z.string().max(80)).max(30),
  sourceUrl: z.url(),
  isFeatured: z.boolean(),
  status: z.enum(["draft", "published"]),
  media: z.array(mediaSchema).min(1, "Add at least one media item.").max(20),
});

export function parseAdminPostForm(formData: FormData): AdminPostInput {
  let media: unknown;

  try {
    media = JSON.parse(String(formData.get("media") ?? "[]"));
  } catch {
    media = [];
  }

  return postSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
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
    category: formData.get("category"),
    industries: commaSeparated(formData.get("industries")),
    colors: commaSeparated(formData.get("colors")),
    styles: commaSeparated(formData.get("styles")),
    sourceUrl: formData.get("sourceUrl"),
    isFeatured: formData.get("isFeatured") === "on",
    status: formData.get("status"),
    media,
  });
}

export function formatValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Check the form and try again.";

  const [section, itemIndex, field] = issue.path;
  if (section === "media" && typeof itemIndex === "number") {
    const fieldLabel = typeof field === "string" ? ` ${field}` : "";
    return `Media ${itemIndex + 1}${fieldLabel}: ${issue.message}`;
  }

  const fieldLabel = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${fieldLabel}${issue.message}`;
}
