import { z } from "zod";

import { LOGO_KINDS } from "../../domain/logo";
import { creatorAvatarUrlSchema } from "../creators/avatar-url";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";
import { normalizeCreatorValidationInput } from "./creator-environment-policy";
import {
  imageUrlSchema,
  isAllowedManagedAssetUrl,
  managedAssetUrlSchema,
  MANAGED_ASSET_URL_ERROR,
} from "./media-url-validation";

import type { AdminLogoInput } from "./types";

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
    username: z.union([z.literal(""), z.string().regex(/^[A-Za-z0-9_]{1,30}$/)]).optional().transform((value) => value || undefined),
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

const logoMediaSchema = z
  .object({
    url: imageUrlSchema,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().optional(),
    variants: z
      .array(
        z.object({
          url: managedAssetUrlSchema,
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
  )
  .refine(
    (media) => !media.storageProvider || isAllowedManagedAssetUrl(media.url),
    { message: MANAGED_ASSET_URL_ERROR, path: ["url"] },
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
  sourceUrl: z.union([z.literal(""), z.url()]),
  status: z.enum(["draft", "published"]),
  media: logoMediaSchema,
}).refine((logo) => logo.kind === "icon" || Boolean(logo.sourceUrl), {
  message: "Add an original source URL for logos.",
  path: ["sourceUrl"],
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
    industry: formData.get("industry"),
    colors: commaSeparated(formData.get("colors")),
    styles: commaSeparated(formData.get("styles")),
    shape: formData.get("shape"),
    sourceUrl: String(formData.get("sourceUrl") ?? "").trim(),
    status: formData.get("status"),
    media,
  });
}
