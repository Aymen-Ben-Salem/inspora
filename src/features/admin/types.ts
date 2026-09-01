import type { MediaType, PostCategory } from "@/domain/post";
import type { LogoKind, LogoStatus } from "@/domain/logo";
import type { WebsiteMediaRole, WebsiteStatus } from "@/domain/website";
import type {
  ImageVariant,
  ManagedMediaAsset,
  MediaStorageProvider,
  VideoPreview,
} from "@/storage/types";

export type {
  ImageVariant,
  ManagedMediaAsset,
  MediaStorageProvider,
  VideoPreview,
};

export type AdminPostStatus = "draft" | "published" | "archived";

export type AdminCreatorInput = {
  id?: string;
  name: string;
  handle?: string;
  url?: string;
  avatarUrl: string;
  avatarStorageProvider?: MediaStorageProvider;
  avatarStorageKey?: string;
};

export type AdminCreatorRecord = AdminCreatorInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminMediaInput = {
  type: MediaType;
  url: string;
  posterUrl?: string;
  storageProvider?: MediaStorageProvider;
  storageKey?: string;
  mimeType?: string;
  sourceMimeType?: string;
  sizeBytes?: number;
  variants?: ImageVariant[];
  videoPreview?: VideoPreview;
  posterStorageKey?: string;
  alt: string;
  width: number;
  height: number;
};

export type AdminPostInput = {
  slug: string;
  title: string;
  creator: AdminCreatorInput;
  description: string;
  category: PostCategory;
  industries: string[];
  colors: string[];
  styles: string[];
  sourceUrl: string;
  isFeatured: boolean;
  status: Exclude<AdminPostStatus, "archived">;
  media: AdminMediaInput[];
};

export type AdminPostRecord = Omit<AdminPostInput, "status" | "creator"> & {
  id: string;
  creator: AdminCreatorRecord;
  status: AdminPostStatus;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminLogoMediaInput = {
  url: string;
  storageProvider?: MediaStorageProvider;
  storageKey?: string;
  mimeType?: string;
  sourceMimeType?: string;
  sizeBytes?: number;
  variants?: ImageVariant[];
  alt: string;
  width: number;
  height: number;
};

export type AdminLogoInput = {
  slug: string;
  title: string;
  kind: LogoKind;
  creator: AdminCreatorInput;
  description: string;
  industry: string;
  colors: string[];
  styles: string[];
  shape: string;
  sourceUrl: string;
  status: Exclude<LogoStatus, "archived">;
  media: AdminLogoMediaInput;
};

export type AdminLogoRecord = Omit<AdminLogoInput, "status" | "creator"> & {
  id: string;
  creator: AdminCreatorRecord;
  status: LogoStatus;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminWebsiteMediaInput = {
  role: WebsiteMediaRole;
  url: string;
  storageProvider?: MediaStorageProvider;
  storageKey?: string;
  mimeType?: string;
  sourceMimeType?: string;
  sizeBytes?: number;
  alt: string;
  width: number;
  height: number;
};

export type AdminWebsiteSectionInput = {
  label: string;
  top: number;
  height: number;
  position: number;
};

export type AdminWebsiteInput = {
  slug: string;
  title: string;
  tagline: string;
  creator: AdminCreatorInput;
  description: string;
  categories: string[];
  themes: string[];
  colors: string[];
  sourceUrl: string;
  status: Exclude<WebsiteStatus, "archived">;
  media: AdminWebsiteMediaInput[];
  sections: AdminWebsiteSectionInput[];
};

export type AdminWebsiteRecord = Omit<AdminWebsiteInput, "status" | "creator"> & {
  id: string;
  creator: AdminCreatorRecord;
  status: WebsiteStatus;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminSponsorInput = {
  id?: string;
  title: string;
  url: string;
  tagline?: string;
  mediaType: "image" | "video";
  mediaUrl?: string;
  mediaPosterUrl?: string;
  mediaStorageProvider?: MediaStorageProvider;
  mediaStorageKey?: string;
  mediaPosterStorageKey?: string;
  mediaWidth: number;
  mediaHeight: number;
  mediaVariants?: ImageVariant[];
  mediaVideoPreview?: VideoPreview;
  mediaAlt: string;
  iconUrl?: string;
  iconStorageProvider?: MediaStorageProvider;
  iconStorageKey?: string;
  isActive: boolean;
};

export type AdminSponsorRecord = AdminSponsorInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminActionState = {
  status: "idle" | "error";
  message?: string;
};

export const initialAdminActionState: AdminActionState = { status: "idle" };
