"use server";

import { requireAdmin } from "@/auth/require-admin";

export type WebsiteMetadata = {
  title?: string;
  description?: string;
  image?: string;
  icon?: string;
  hostname: string;
};

export async function fetchWebsiteMetadataAction(
  urlStr: string,
): Promise<{ ok: true; data: WebsiteMetadata } | { ok: false; message: string }> {
  await requireAdmin();

  let url: URL;
  try {
    url = new URL(urlStr);
    if (!url.protocol.startsWith("http")) {
      return { ok: false, message: "URL must start with http:// or https://" };
    }
  } catch {
    return { ok: false, message: "Invalid URL provided." };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 InsporaBot/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: true,
        data: {
          hostname: url.hostname,
          icon: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`,
        },
      };
    }

    const html = await response.text();

    const resolveUrl = (link?: string | null) => {
      if (!link) return undefined;
      try {
        return new URL(link, url.origin).toString();
      } catch {
        return undefined;
      }
    };

    // Extract og:image or twitter:image
    const ogImageMatch =
      html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      html.match(/<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

    // Extract og:title or <title>
    const ogTitleMatch =
      html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);

    // Extract description
    const ogDescMatch =
      html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
      html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);

    // Extract favicon / apple-touch-icon
    const iconMatch =
      html.match(/<link\s+[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*apple-touch-icon[^"']*["']/i) ||
      html.match(/<link\s+[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i);

    const image = resolveUrl(ogImageMatch?.[1]);
    const icon =
      resolveUrl(iconMatch?.[1]) ||
      `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
    const title = ogTitleMatch?.[1]?.trim();
    const description = ogDescMatch?.[1]?.trim();

    return {
      ok: true,
      data: {
        title,
        description,
        image,
        icon,
        hostname: url.hostname,
      },
    };
  } catch {
    return {
      ok: true,
      data: {
        hostname: url.hostname,
        icon: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`,
      },
    };
  }
}
