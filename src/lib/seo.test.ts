import { describe, expect, it } from "vitest";

import type { Website } from "@/domain/website";
import type { Post } from "@/domain/post";
import type { Logo } from "@/domain/logo";

import {
  absoluteUrl,
  buildCreatorMetadata,
  buildCreatorStructuredData,
  buildWebsiteCollectionStructuredData,
  buildLogoCollectionStructuredData,
  buildPostStructuredData,
  buildWebsiteStructuredData,
  getPostCoverImage,
  serializeJsonLd,
  SITE_OG_IMAGE,
  SITE_URL,
} from "./seo";

const post: Post = {
  id: "post-1",
  slug: "example-project",
  title: "Example Project",
  creator: {
    id: "creator-1",
    name: "Jane Example",
    url: "https://example.com",
    avatarUrl: "/brand/default-avatar.png",
  },
  description: "A concise description of the example project.",
  category: "Branding",
  industries: ["Culture"],
  colors: ["Black"],
  styles: ["Editorial"],
  sourceUrl: "https://example.com/project",
  createdAt: "2026-08-01T00:00:00.000Z",
  publishedAt: "2026-08-02T00:00:00.000Z",
  isFeatured: false,
  media: [],
};

const logo: Logo = {
  id: "logo-1",
  slug: "example-logo",
  title: "Example Logo",
  kind: "logo",
  creator: {
    id: "creator-1",
    name: "Jane Example",
    url: "https://example.com",
    avatarUrl: "/brand/default-avatar.png",
  },
  description: "A clean identity system.",
  industry: "SaaS",
  colors: ["Black", "White"],
  styles: ["Minimal"],
  shape: "Symbol & text",
  sourceUrl: "https://example.com/logo",
  createdAt: "2026-08-01T00:00:00.000Z",
  publishedAt: "2026-08-02T00:00:00.000Z",
  media: {
    id: "logo-media-1",
    url: "https://media.example.com/logo.webp",
    alt: "Example logo",
    width: 1080,
    height: 659,
  },
};

describe("design cover metadata", () => {
  const image: Post["media"][number] = {
    id: "cover", type: "image", url: "/media/design.webp", alt: "Design preview",
    width: 1200, height: 800, position: 0,
  };
  const video: Post["media"][number] = {
    ...image, type: "video", url: "https://media.example.com/motion.mp4",
    posterUrl: "https://media.example.com/motion-poster.webp",
  };

  it("uses the image itself for social and CreativeWork previews", () => {
    expect(getPostCoverImage(image)).toEqual({
      url: image.url, alt: image.alt, width: image.width, height: image.height,
    });
    expect(buildPostStructuredData({ ...post, media: [image] }).image)
      .toBe("https://www.inspora.design/media/design.webp");
  });

  it("uses a video's poster without publishing the MP4 or assuming poster dimensions", () => {
    expect(getPostCoverImage(video)).toEqual({ url: video.posterUrl, alt: video.alt });
    const data = buildPostStructuredData({ ...post, media: [video] });
    expect(data.image).toBe(video.posterUrl);
    expect(JSON.stringify(data)).not.toContain(video.url);
    expect(data.creator).toMatchObject({ name: post.creator.name, url: post.creator.url });
  });

  it.each([undefined, { ...video, posterUrl: undefined }])(
    "leaves missing artwork previews available for the social fallback without fabricating a work image (%s)",
    (cover) => {
      expect(getPostCoverImage(cover)).toBeUndefined();
      expect(buildPostStructuredData({ ...post, media: cover ? [cover] : [] }))
        .not.toHaveProperty("image");
    },
  );
});

describe("SEO helpers", () => {
  it("builds canonical URLs on the production www origin", () => {
    expect(SITE_URL).toBe("https://www.inspora.design");
    expect(absoluteUrl("/posts/example-project")).toBe(
      "https://www.inspora.design/posts/example-project",
    );
    expect(absoluteUrl(SITE_OG_IMAGE)).toBe(
      "https://www.inspora.design/brand/inspora-og.png",
    );
  });

  it("builds website identity schema without visual or client data", () => {
    expect(buildWebsiteStructuredData()).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: "Inspora",
          url: "https://www.inspora.design/",
        },
        {
          "@type": "WebSite",
          name: "Inspora",
          url: "https://www.inspora.design/",
        },
      ],
    });
  });

  it("builds a concise CreativeWork entity from an already-loaded post", () => {
    expect(buildPostStructuredData(post)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: "Example Project",
      url: "https://www.inspora.design/posts/example-project",
      datePublished: "2026-08-02T00:00:00.000Z",
      genre: "Branding",
      creator: {
        "@type": "Person",
        name: "Jane Example",
        url: "https://example.com",
      },
      citation: "https://example.com/project",
    });
  });

  it("describes the logos archive as a structured collection", () => {
    expect(buildLogoCollectionStructuredData([logo])).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      url: "https://www.inspora.design/logos",
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: 1,
        itemListElement: [
          {
            position: 1,
            item: {
              "@type": "CreativeWork",
              name: "Example Logo",
              image: "https://media.example.com/logo.webp",
            },
          },
        ],
      },
    });
  });

  it("escapes markup-significant characters in JSON-LD", () => {
    const serialized = serializeJsonLd({ value: "</script><script>alert(1)</script>" });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });
});

const creator = {
  id: "creator-1", name: "Jane Example", username: "jane",
  avatarUrl: "/brand/default-avatar.png", websiteUrl: "https://example.com", xProfileUrl: null,
};

describe("redesigned archive SEO", () => {
  it("uses the canonical creator identity in metadata and structured data", () => {
    const metadata = buildCreatorMetadata(creator, "jane-current");
    expect(metadata.alternates).toEqual({ canonical: "/creators/jane-current" });
    expect(metadata.openGraph).toMatchObject({ url: "/creators/jane-current", title: "Jane Example" });
    expect(metadata.twitter).toMatchObject({ title: "Jane Example" });
    const data = buildCreatorStructuredData(creator, "jane-current");
    expect(data.mainEntity.url).toBe("https://www.inspora.design/creators/jane-current");
    expect(data.mainEntity.sameAs).toEqual(["https://example.com"]);
    expect(data.mainEntity.image).toBe("https://www.inspora.design/brand/default-avatar.png");
  });

  it("describes the website archive without fabricating entries for an empty collection", () => {
    expect(buildWebsiteCollectionStructuredData([])).toMatchObject({
      "@type": "CollectionPage", url: "https://www.inspora.design/websites",
      mainEntity: { numberOfItems: 0, itemListElement: [] },
    });
  });

  it.each([
    ["design", (attribution: Post["creator"]) => buildPostStructuredData({ ...post, creator: attribution }).creator],
    ["logo", (attribution: Logo["creator"]) => buildLogoCollectionStructuredData([{ ...logo, creator: attribution }]).mainEntity.itemListElement[0].item.creator],
  ] as const)("connects a %s credit to the same creator entity as its public profile", (_kind, buildAttribution) => {
    const profile = buildCreatorStructuredData(creator, "jane-current");
    const attribution = buildAttribution({ ...post.creator, username: "jane-current" });

    expect(attribution).toMatchObject({
      "@id": profile.mainEntity["@id"],
      url: profile.mainEntity.url,
      name: profile.mainEntity.name,
      sameAs: ["https://example.com"],
    });
  });

  it("does not invent a public creator profile from a legacy handle", () => {
    const attribution = buildPostStructuredData({
      ...post,
      creator: { ...post.creator, handle: "@jane-legacy", url: undefined },
    }).creator;

    expect(attribution).toEqual({ "@type": "Person", name: "Jane Example" });
  });
});

it("preserves website attribution and poster data in the collection", () => {
  const website: Website = {
    id: "site-1", slug: "example", title: "Example website", tagline: "A portfolio",
    description: "An editorial portfolio", creator: { ...creator, username: "jane-current", url: "https://example.com" },
    categories: ["Portfolio"], themes: ["Editorial"], colors: ["Black"],
    sourceUrl: "https://example.com", isFeatured: false,
    createdAt: "2026-08-01T00:00:00.000Z", publishedAt: "2026-08-02T00:00:00.000Z",
    recording: {
      id: "recording", role: "recording", url: "https://media.example.com/full.mp4",
      posterUrl: "https://media.example.com/poster.webp", alt: "Portfolio preview", width: 1200, height: 900,
      videoPreview: { url: "https://media.example.com/preview.mp4", storageKey: "preview.mp4", format: "mp4", width: 600, height: 450, bytes: 1024 },
    },
    favicon: { id: "icon", role: "favicon", url: "https://example.com/favicon.ico", alt: "", width: 32, height: 32 },
    sections: [],
  };
  expect(buildWebsiteCollectionStructuredData([website]).mainEntity).toMatchObject({
    numberOfItems: 1,
    itemListElement: [{ position: 1, item: {
      name: "Example website", image: "https://media.example.com/poster.webp",
      citation: "https://example.com", creator: {
        "@id": buildCreatorStructuredData(creator, "jane-current").mainEntity["@id"],
        url: "https://www.inspora.design/creators/jane-current",
        sameAs: ["https://example.com"],
      },
    } }],
  });
});
