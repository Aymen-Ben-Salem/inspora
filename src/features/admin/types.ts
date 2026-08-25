import type { MediaType, PostCategory } from "@/domain/post";
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
