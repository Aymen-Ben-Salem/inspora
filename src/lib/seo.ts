import type { Post } from "@/domain/post";
import type { Logo } from "@/domain/logo";

export const SITE_NAME = "Inspora";
export const SITE_URL = "https://www.inspora.design";
export const SITE_DESCRIPTION =
  "A curated archive of recent visual design and creative work.";
export const SITE_EMAIL = "Neroodesigner@gmail.com";
export const SITE_OG_IMAGE = "/brand/inspora-og.png";

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, `${SITE_URL}/`).toString();
}

export function buildWebsiteStructuredData() {
  const organizationId = absoluteUrl("/#organization");
  const websiteId = absoluteUrl("/#website");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/brand/inspora-icon-v1.svg"),
        },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "editorial inquiries",
          email: SITE_EMAIL,
          availableLanguage: "English",
        },
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: SITE_NAME,
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
    ],
  };
}

export function buildPostStructuredData(post: Post) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": absoluteUrl(`/posts/${post.slug}#creative-work`),
    url: absoluteUrl(`/posts/${post.slug}`),
    mainEntityOfPage: absoluteUrl(`/posts/${post.slug}`),
    name: post.title,
    description: post.description,
    inLanguage: "en",
    datePublished: post.publishedAt,
    genre: post.category,
    keywords: [post.category, ...post.industries, ...post.styles],
    creator: {
      "@type": "Person",
      name: post.creator.name,
      ...(post.creator.url ? { url: post.creator.url } : {}),
    },
    publisher: { "@id": absoluteUrl("/#organization") },
    citation: post.sourceUrl,
  };
}

export function buildLogoCollectionStructuredData(logos: Logo[]) {
  const collectionUrl = absoluteUrl("/logos");

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${collectionUrl}#collection`,
    url: collectionUrl,
    name: "Curated logo and icon inspiration",
    description:
      "A curated archive of logos and icons with creator attribution, industry, colour, style, and shape details.",
    inLanguage: "en",
    isPartOf: { "@id": absoluteUrl("/#website") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: logos.length,
      itemListElement: logos.map((logo, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: logo.title,
          description: logo.description,
          image: absoluteUrl(logo.media.url),
          genre: logo.kind,
          keywords: [
            logo.kind,
            logo.industry,
            logo.shape,
            ...logo.colors,
            ...logo.styles,
          ],
          datePublished: logo.publishedAt,
          creator: {
            "@type": "Person",
            name: logo.creator.name,
            ...(logo.creator.url ? { url: logo.creator.url } : {}),
          },
          citation: logo.sourceUrl,
        },
      })),
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
