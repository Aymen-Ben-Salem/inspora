import type { WebsiteSection } from "@/domain/website";

function safeFilePart(value: string, fallback: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export function getDefaultWebsiteSectionId(
  sections: ReadonlyArray<Pick<WebsiteSection, "id">>,
) {
  return sections[0]?.id;
}

export function shouldClearWebsiteSectionSelection({
  clickedMediaTab,
  clickedSection,
}: {
  clickedMediaTab: boolean;
  clickedSection: boolean;
}) {
  return !clickedMediaTab && !clickedSection;
}

export function getWebsiteSectionFileName(
  websiteSlug: string,
  sectionLabel: string,
  mimeType?: string,
) {
  const website = safeFilePart(websiteSlug, "website");
  const section = safeFilePart(sectionLabel, "section");
  const extension =
    ({
      "image/avif": "avif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    } as Record<string, string>)[mimeType ?? ""] ?? "img";
  return `${website}-${section}.${extension}`;
}
