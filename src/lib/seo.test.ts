import { describe, expect, it } from "vitest";

import type { Post } from "@/domain/post";
import type { Logo } from "@/domain/logo";

import {
  absoluteUrl,
  buildLogoCollectionStructuredData,
  buildPostStructuredData,
  buildWebsiteStructuredData,
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
