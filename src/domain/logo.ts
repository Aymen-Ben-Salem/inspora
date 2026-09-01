import type { ImageVariant, MediaStorageProvider } from "@/storage/types";

export const LOGO_KINDS = ["logo", "icon"] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

export const LOGO_STATUSES = ["draft", "published", "archived"] as const;
export type LogoStatus = (typeof LOGO_STATUSES)[number];

export type LogoCreator = {
  id: string;
  name: string;
  handle?: string;
  url?: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
};

export type LogoMedia = {
  id: string;
  url: string;
  storageProvider?: MediaStorageProvider;
  mimeType?: string;
  sourceMimeType?: string;
  sizeBytes?: number;
  variants?: ImageVariant[];
  alt: string;
  width: number;
  height: number;
};

export type Logo = {
  id: string;
  slug: string;
  title: string;
  kind: LogoKind;
  creator: LogoCreator;
  description: string;
  industry: string;
  colors: string[];
  styles: string[];
  shape: string;
  sourceUrl: string;
  createdAt: string;
  publishedAt: string;
  media: LogoMedia;
};

export function isLogoKind(value: string): value is LogoKind {
  return LOGO_KINDS.some((kind) => kind === value);
}

export function isLogoStatus(value: string): value is LogoStatus {
  return LOGO_STATUSES.some((status) => status === value);
}
