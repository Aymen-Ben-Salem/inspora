import "server-only";
import { creators, logoMedia, logos } from "@/db/schema";
import { isLogoKind, type Logo } from "@/domain/logo";
import { isMediaStorageProvider } from "@/storage/types";

type LogoRow = typeof logos.$inferSelect;
type CreatorRow = typeof creators.$inferSelect;
type MediaRow = typeof logoMedia.$inferSelect;
type PublicLogoRecord = LogoRow & { creator: CreatorRow; media: MediaRow[] };

export function mapPublishedLogo(row: PublicLogoRecord): Logo {
  if (!isLogoKind(row.kind)) throw new Error(`Unsupported logo kind: ${row.kind}`);
  const media = row.media[0];
  if (!media) throw new Error(`Published logo ${row.id} has no media.`);
  if (typeof media.url !== "string" || !media.url ||
    !Number.isFinite(media.width) || media.width <= 0 ||
    !Number.isFinite(media.height) || media.height <= 0) {
    throw new Error(`Published logo ${row.id} has malformed media.`);
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      username: row.creator.username ?? undefined,
      handle: row.creator.handle ?? undefined,
      url: row.creator.url ?? undefined,
      avatarUrl: row.creator.avatarUrl,
      avatarStorageProvider: isMediaStorageProvider(row.creator.avatarStorageProvider)
        ? row.creator.avatarStorageProvider
        : undefined,
    },
    description: row.description,
    industry: row.industry,
    colors: row.colors,
    styles: row.styles,
    shape: row.shape,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    media: {
      id: media.id,
      url: media.url,
      storageProvider: isMediaStorageProvider(media.storageProvider)
        ? media.storageProvider
        : undefined,
      mimeType: media.mimeType ?? undefined,
      sourceMimeType: media.sourceMimeType ?? undefined,
      sizeBytes: media.sizeBytes ?? undefined,
      variants: media.variants,
      alt: media.alt,
      width: media.width,
      height: media.height,
    },
  };
}
