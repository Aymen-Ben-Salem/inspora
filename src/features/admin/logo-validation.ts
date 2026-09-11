import { z } from "zod";

import { LOGO_KINDS } from "../../domain/logo";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";
import { normalizeCreatorValidationInput } from "./creator-environment-policy";

import type { AdminLogoInput } from "./types";

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
      ["images.unsplash.com", process.env.MEDIA_HOSTNAME, r2Hostname].filter(
        Boolean,
      ),
    );
    return url.protocol === "https:" && allowedHostnames.has(url.hostname);
  } catch {
    return false;
  }
}

const assetUrl = z
  .string()
  .trim()
  .refine(
    isAllowedAssetUrl,
    "Use a local path or an https URL from the configured media hostname.",
  );

const optionalRemoteUrl = z
  .union([z.literal(""), z.url()])
  .transform((value) => value || undefined);

const creatorSchema = z.preprocess(
  (input) => normalizeCreatorValidationInput(input, process.env.DATA_ENVIRONMENT),
  z
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
  ),
);

const logoMediaSchema = z
  .object({
    url: assetUrl,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().optional(),
    variants: z
      .array(
        z.object({
          url: assetUrl,
          storageKey: z.string().trim().min(1).max(1024),
          width: z.coerce.number().int().positive().max(12000),
          height: z.coerce.number().int().positive().max(12000),
          bytes: z.coerce.number().int().positive(),
          format: z.literal("webp"),
        }),
      )
      .max(4)
      .optional(),
    alt: z.string().trim().max(500),
    width: z.coerce.number().int().min(1).max(12000),
    height: z.coerce.number().int().min(1).max(12000),
  })
  .refine(
    (media) => Boolean(media.storageProvider) === Boolean(media.storageKey),
    "Managed logo media must include its storage provider and key.",
  );

function commaSeparated(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const logoSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(LOGO_KINDS),
  creator: creatorSchema,
  description: z.string().trim().min(1).max(4000),
  industry: z.string().trim().min(1).max(120),
  colors: z.array(z.string().max(80)).min(1, "Add at least one colour.").max(30),
  styles: z.array(z.string().max(80)).min(1, "Add at least one style.").max(30),
  shape: z.string().trim().min(1).max(120),
  sourceUrl: z.url(),
  status: z.enum(["draft", "published"]),
  media: logoMediaSchema,
});

export function parseAdminLogoForm(formData: FormData): AdminLogoInput {
  let media: unknown;

  try {
    media = JSON.parse(String(formData.get("media") ?? "{}"));
  } catch {
    media = {};
  }

  return logoSchema.parse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    kind: formData.get("kind"),
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
    industry: formData.get("industry"),
    colors: commaSeparated(formData.get("colors")),
    styles: commaSeparated(formData.get("styles")),
    shape: formData.get("shape"),
    sourceUrl: formData.get("sourceUrl"),
    status: formData.get("status"),
    media,
  });
}
