import type { Metadata } from "next";
import type { Website } from "@/domain/website";
import type { CreatorSummary } from "@/features/creators/types";
import type { Post } from "@/domain/post";
import type { Logo } from "@/domain/logo";

export const SITE_NAME = "Inspora";
export const SITE_URL = "https://www.inspora.design";
export const SITE_DESCRIPTION =
  "Discover curated design, website, logo, and app icon inspiration on Inspora. Explore creative work, meet its creators, and save references for your next project.";
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

export function buildCreatorMetadata(profile: CreatorSummary, username: string): Metadata {
  const title = profile.name;
  const description = `Explore designs, websites, logos, and app icons by ${profile.name} on Inspora.`;
  const url = `/creators/${encodeURIComponent(username)}`;
  const images = [profile.avatarUrl || SITE_OG_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "profile", title, description, url, images },
    twitter: { card: "summary", title, description, images },
  };
}

export function buildCreatorStructuredData(profile: CreatorSummary, username: string) {
  const url = absoluteUrl(`/creators/${encodeURIComponent(username)}`);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    name: profile.name,
    isPartOf: { "@id": absoluteUrl("/#website") },
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#creator`,
      name: profile.name,
      url,
      ...(profile.avatarUrl ? { image: absoluteUrl(profile.avatarUrl) } : {}),
      sameAs: [profile.websiteUrl, profile.xProfileUrl].filter(Boolean),
    },
  };
}

export function buildWebsiteCollectionStructuredData(websites: Website[]) {
  const url = absoluteUrl("/websites");
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: "Curated website design inspiration",
    description: "Website design inspiration with full-page previews, sections, and creator credits.",
    inLanguage: "en",
    isPartOf: { "@id": absoluteUrl("/#website") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: websites.length,
      itemListElement: websites.map((website, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: website.title,
          description: website.description,
          image: absoluteUrl(website.recording.posterUrl),
          datePublished: website.publishedAt,
          keywords: [...website.categories, ...website.themes, ...website.colors],
          creator: {
            "@type": "Person",
            name: website.creator.name,
            ...(website.creator.username
              ? { url: absoluteUrl(`/creators/${encodeURIComponent(website.creator.username)}`) }
              : website.creator.url ? { url: website.creator.url } : {}),
          },
          citation: website.sourceUrl,
        },
      })),
    },
  };
}
