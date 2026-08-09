import type { ImageVariant, MediaStorageProvider } from "@/storage/types";

export const POST_CATEGORIES = [
  "Web",
  "Branding",
  "Product",
  "Motion",
  "Illustration",
  "3D",
  "Print",
] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number];
export const POST_VIEWS = ["latest", "featured"] as const;
export type PostView = (typeof POST_VIEWS)[number];
export type MediaType = "image" | "video";

export type PostMedia = {
  id: string;
  type: MediaType;
  url: string;
  posterUrl?: string;
  storageProvider?: MediaStorageProvider;
  mimeType?: string;
  sizeBytes?: number;
  variants?: ImageVariant[];
  alt: string;
  width: number;
  height: number;
  position: number;
};

export type Creator = {
  id: string;
  name: string;
  handle?: string;
  url?: string;
  avatarUrl: string;
};

export type Post = {
  id: string;
  slug: string;
  title: string;
  creator: Creator;
  description: string;
  category: PostCategory;
  industries: string[];
  colors: string[];
  styles: string[];
  sourceUrl: string;
  createdAt: string;
  publishedAt: string;
  isFeatured: boolean;
  media: PostMedia[];
};

export function isPostCategory(value: string): value is PostCategory {
  return POST_CATEGORIES.some((category) => category === value);
}

export function isPostView(value: string): value is PostView {
  return POST_VIEWS.some((view) => view === value);
}

export function isGifUrl(value: string) {
  try {
    return new URL(value, "https://inspora.local").pathname.toLowerCase().endsWith(".gif");
  } catch {
    return false;
  }
}
