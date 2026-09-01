import type { MediaStorageProvider } from "@/storage/types";

export const WEBSITE_STATUSES = ["draft", "published", "archived"] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const WEBSITE_MEDIA_ROLES = ["full_page", "favicon"] as const;
export type WebsiteMediaRole = (typeof WEBSITE_MEDIA_ROLES)[number];

export type WebsiteCreator = {
  id: string;
  name: string;
  handle?: string;
  url?: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
};

export type WebsiteMedia = {
  id: string;
  role: WebsiteMediaRole;
  url: string;
  storageProvider?: MediaStorageProvider;
  mimeType?: string;
  sourceMimeType?: string;
  sizeBytes?: number;
  alt: string;
  width: number;
  height: number;
};

export type WebsiteSection = {
  id: string;
  label: string;
  top: number;
  height: number;
  position: number;
};

export type Website = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  creator: WebsiteCreator;
  description: string;
  categories: string[];
  themes: string[];
  colors: string[];
  sourceUrl: string;
  createdAt: string;
  publishedAt: string;
  fullPage: WebsiteMedia;
  favicon: WebsiteMedia;
  sections: WebsiteSection[];
};

export function isWebsiteStatus(value: string): value is WebsiteStatus {
  return WEBSITE_STATUSES.some((status) => status === value);
}

export function isWebsiteMediaRole(value: string): value is WebsiteMediaRole {
  return WEBSITE_MEDIA_ROLES.some((role) => role === value);
}
