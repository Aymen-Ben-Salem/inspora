import type { creators, postMedia, posts } from "@/db/schema";
import type { MediaType, PostCardData } from "@/domain/post";
import { isMediaStorageProvider } from "@/storage/types";

type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof postMedia.$inferSelect;
type PostRow = typeof posts.$inferSelect;
type PostCardCreatorRow = Pick<
  CreatorRow,
  "name" | "username" | "avatarUrl" | "avatarStorageProvider"
>;
type PostCardMediaRow = Pick<
  MediaRow,
  | "id"
  | "type"
  | "url"
  | "posterUrl"
  | "storageProvider"
  | "variants"
  | "videoPreview"
  | "alt"
  | "width"
  | "height"
>;
type PostCardRecord = Pick<PostRow, "id" | "slug" | "title" | "createdAt"> & {
  creator: PostCardCreatorRow;
  media: PostCardMediaRow[];
  mediaCount: number;
};

export function mapPostCard(row: PostCardRecord): PostCardData {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: {
      name: row.creator.name,
      username: row.creator.username ?? undefined,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: isMediaStorageProvider(row.creator.avatarStorageProvider)
        ? row.creator.avatarStorageProvider
        : undefined,
    },
    createdAt: row.createdAt.toISOString(),
    media: row.media.map((media) => ({
      id: media.id,
      type: media.type as MediaType,
      url: media.url,
      posterUrl: media.posterUrl ?? undefined,
      storageProvider: isMediaStorageProvider(media.storageProvider)
        ? media.storageProvider
        : undefined,
      variants: media.variants,
      videoPreview: media.videoPreview ?? undefined,
      alt: media.alt,
      width: media.width,
      height: media.height,
    })),
    mediaCount: row.mediaCount,
  };
}
