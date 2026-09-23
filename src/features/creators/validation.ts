const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const X_USERNAME_PATTERN = /^[a-z0-9_]{1,15}$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "creators",
  "new",
  "profile",
  "settings",
  "sign_in",
  "sign_up",
]);

const RESERVED_X_PATHS = new Set([
  "compose",
  "explore",
  "home",
  "i",
  "intent",
  "messages",
  "notifications",
  "search",
  "settings",
]);

export function normalizeCreatorUsername(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 30);
}

export function validateCreatorUsername(username: string):
  | { ok: true }
  | { ok: false; message: string } {
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      message: "Use 3-30 lowercase letters, numbers, or underscores.",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, message: "That username is reserved." };
  }
  return { ok: true };
}

export function creatorUsernameCandidates(value: string) {
  const normalized = normalizeCreatorUsername(value);
  const base = validateCreatorUsername(normalized).ok ? normalized : "creator";

  return Array.from({ length: 100 }, (_, index) => {
    if (index === 0) return base.slice(0, 30);
    const suffix = `_${index + 1}`;
    return `${base.slice(0, 30 - suffix.length)}${suffix}`;
  });
}

export function normalizeXUsername(value: string) {
  const username = value.trim().replace(/^@/, "").toLowerCase();
  if (!X_USERNAME_PATTERN.test(username) || RESERVED_X_PATHS.has(username)) {
    throw new Error("Use a valid X username.");
  }
  return username;
}

export function normalizeXProfileUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      url.protocol !== "https:" ||
      (hostname !== "x.com" && hostname !== "twitter.com") ||
      url.username ||
      url.password
    ) {
      throw new Error();
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (
      segments.length !== 1 &&
      !(segments.length === 3 && segments[1]?.toLowerCase() === "status")
    ) {
      throw new Error();
    }
    const username = normalizeXUsername(segments[0] ?? "");
    return `https://x.com/${username}`;
  } catch {
    throw new Error("Use a valid X profile URL.");
  }
}

function isAllowedAvatarUrl(value: string) {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    const configuredHosts = [process.env.MEDIA_HOSTNAME];
    if (process.env.R2_PUBLIC_BASE_URL) {
      try {
        configuredHosts.push(new URL(process.env.R2_PUBLIC_BASE_URL).hostname);
      } catch {}
    }
    return (
      url.protocol === "https:" &&
      ["images.unsplash.com", ...configuredHosts].filter(Boolean).includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const optionalUrl = z
  .union([z.literal(""), z.url()])
  .transform((value) => value || undefined);

const adminCreatorSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]).transform((value) => value || undefined),
    name: z.string().trim().min(1).max(160),
    legacyHandle: z.string().trim().max(160).optional(),
    username: z.string().trim().optional(),
    url: optionalUrl,
    xProfileUrl: optionalUrl,
    avatarUrl: z.string().trim().refine(
      isAllowedAvatarUrl,
      "Use a local path or an https URL from the configured media hostname.",
    ),
    avatarStorageProvider: z.enum(MEDIA_STORAGE_PROVIDERS).optional(),
    avatarStorageKey: z.string().trim().min(1).max(1024).optional(),
  })
  .superRefine((creator, context) => {
    if (creator.username) {
      const result = validateCreatorUsername(creator.username);
      if (!result.ok) {
        context.addIssue({
          code: "custom",
          path: ["username"],
          message: result.message,
        });
      }
    }
    if (creator.xProfileUrl) {
      try {
        normalizeXProfileUrl(creator.xProfileUrl);
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["xProfileUrl"],
          message: error instanceof Error ? error.message : "Use a valid X profile URL.",
        });
      }
    }
    if (
      Boolean(creator.avatarStorageProvider) !== Boolean(creator.avatarStorageKey)
    ) {
      context.addIssue({
        code: "custom",
        path: ["avatarUrl"],
        message: "Managed creator avatars must include their storage provider and key.",
      });
    }
  })
  .transform((creator) => ({
    ...creator,
    legacyHandle: creator.legacyHandle || undefined,
    username: creator.username || undefined,
  }));

export function parseAdminCreatorForm(formData: FormData): AdminCreatorInput {
  return adminCreatorSchema.parse({
    id: formData.get("creatorId"),
    name: formData.get("creatorName"),
    legacyHandle: String(formData.get("creatorHandle") ?? "") || undefined,
    username: String(formData.get("creatorUsername") ?? "") || undefined,
    url: formData.get("creatorUrl"),
    xProfileUrl: formData.get("creatorXProfileUrl"),
    avatarUrl: formData.get("creatorAvatarUrl"),
    avatarStorageProvider:
      String(formData.get("creatorAvatarStorageProvider") ?? "") || undefined,
    avatarStorageKey:
      String(formData.get("creatorAvatarStorageKey") ?? "") || undefined,
  });
}

export function validateAdminCreatorInput(
  input: AdminCreatorInput,
): AdminCreatorInput {
  return adminCreatorSchema.parse({
    ...input,
    id: input.id ?? "",
    url: input.url ?? "",
    xProfileUrl: input.xProfileUrl ?? "",
  });
}
import { z } from "zod";

import { MEDIA_STORAGE_PROVIDERS } from "../../storage/types";

import type { AdminCreatorInput } from "./types";
