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
  feedDescription?: string;
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
  | "feedDescription"
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
> & { paidThrough?: string; serverTime?: string; versionId?: string; wordmarkUrl?: string; promoLabel?: SponsorPromoLabel };

/** A short promotional pill on the sponsor feed card, such as a sale. */
export type SponsorPromoLabel = {
  text: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
};
