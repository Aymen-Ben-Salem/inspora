import { z } from "zod";

import { WEBSITE_MEDIA_ROLES } from "../../domain/website";
import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminWebsiteInput } from "./types";

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

const websiteMediaSchema = z
  .object({
    role: z.enum(WEBSITE_MEDIA_ROLES),
    url: assetUrl,
    storageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    storageKey: z.string().trim().min(1).max(1024).optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    sourceMimeType: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.coerce.number().int().positive().optional(),
    alt: z.string().trim().max(500),
    width: z.coerce.number().int().min(1).max(12000),
    height: z.coerce.number().int().min(1).max(60000),
  })
  .refine(
    (media) => Boolean(media.storageProvider) === Boolean(media.storageKey),
    "Managed website media must include its storage provider and key.",
  );

const sectionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  top: z.coerce.number().int().min(0).max(60000),
  height: z.coerce.number().int().min(1).max(60000),
  position: z.coerce.number().int().min(0).max(99),
});

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
    const roles = new Set(website.media.map((media) => media.role));
    for (const role of WEBSITE_MEDIA_ROLES) {
      if (!roles.has(role)) {
        context.addIssue({
          code: "custom",
          path: ["media"],
          message: `Add the ${role === "full_page" ? "full-page screenshot" : "favicon"}.`,
        });
      }
    }

    const fullPage = website.media.find((media) => media.role === "full_page");
    if (!fullPage) return;
    website.sections.forEach((section, index) => {
      if (section.top + section.height > fullPage.height) {
        context.addIssue({
          code: "custom",
          path: ["sections", index],
          message: "The crop extends past the full-page screenshot.",
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
