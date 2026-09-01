import type { Post } from "@/domain/post";

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

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
