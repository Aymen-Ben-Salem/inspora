import { SITE_URL } from "../../src/lib/seo";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemap(slugs: readonly string[]) {
  const entries = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: "1.0",
    },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/posts/${slug}`,
      changeFrequency: "monthly",
      priority: "0.8",
    })),
  ];

  const urls = entries
    .map(
      ({ url, changeFrequency, priority }) => `  <url>
    <loc>${escapeXml(url)}</loc>
    <changefreq>${changeFrequency}</changefreq>
    <priority>${priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
