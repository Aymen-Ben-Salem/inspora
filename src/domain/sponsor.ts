import type {
  ImageVariant,
  MediaStorageProvider,
  VideoPreview,
} from "@/storage/types";

export type Sponsor = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type ActiveSponsor = Pick<
  Sponsor,
  | "id"
  | "title"
  | "url"
  | "tagline"
  | "mediaType"
  | "mediaUrl"
  | "mediaPosterUrl"
  | "mediaStorageProvider"
  | "mediaWidth"
  | "mediaHeight"
  | "mediaVariants"
  | "mediaVideoPreview"
  | "mediaAlt"
  | "iconUrl"
  | "iconStorageProvider"
>;
