import type { Website, WebsiteSection } from "@/domain/website";

type SectionCropInput = {
  bitmapHeight: number;
  bitmapWidth: number;
  fullPageHeight: number;
  sectionHeight: number;
  sectionTop: number;
};

function safeFilePart(value: string, fallback: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The website section could not be prepared.")),
      "image/png",
    );
  });
}

export function getDefaultWebsiteSectionId(
  sections: ReadonlyArray<Pick<WebsiteSection, "id">>,
) {
  return sections[0]?.id;
}

export function getWebsiteTransitionHero(
  website: Pick<Website, "fullPage" | "sections">,
) {
  const hero = website.sections[0];
  if (!hero) return undefined;

  return {
    ...hero,
    height: Math.min(
      website.fullPage.height - hero.top,
      Math.round((website.fullPage.width * 659) / 1080),
    ),
  };
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

export function getScaledWebsiteSectionCrop({
  bitmapHeight,
  bitmapWidth,
  fullPageHeight,
  sectionHeight,
  sectionTop,
}: SectionCropInput) {
  const scale = bitmapHeight / fullPageHeight;
  const y = Math.max(
    0,
    Math.min(bitmapHeight - 1, Math.round(sectionTop * scale)),
  );
  const height = Math.max(
    1,
    Math.min(bitmapHeight - y, Math.round(sectionHeight * scale)),
  );

  return { x: 0, y, width: bitmapWidth, height };
}

export function getWebsiteSectionFileName(
  websiteSlug: string,
  sectionLabel: string,
) {
  const website = safeFilePart(websiteSlug, "website");
  const section = safeFilePart(sectionLabel, "section");
  return `${website}-${section}.png`;
}

export async function cropWebsiteSectionToPng(
  source: Blob,
  fullPageHeight: number,
  section: Pick<WebsiteSection, "height" | "top">,
) {
  const image = await createImageBitmap(source);

  try {
    const crop = getScaledWebsiteSectionCrop({
      bitmapHeight: image.height,
      bitmapWidth: image.width,
      fullPageHeight,
      sectionHeight: section.height,
      sectionTop: section.top,
    });
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The website section could not be prepared.");

    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    return await canvasToPng(canvas);
  } finally {
    image.close();
  }
}
