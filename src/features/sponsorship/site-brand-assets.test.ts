import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildWebsiteStructuredData, serializeJsonLd, SITE_ICON, SITE_ICONS, SITE_URL, SITE_WORDMARK } from "@/lib/seo";
import { createMetadataFetcher } from "./metadata";
import { prepareWebsiteSuggestion } from "./suggestion-images";

describe("Inspora brand discovery for sponsor suggestions", () => {
  it("discovers and imports the actual supplied icon and full wordmark from site metadata", async () => {
    const icons = (SITE_ICONS as { icon: { url: string; type: string; media?: string }[] }).icon;
    const html = `<meta property="og:site_name" content="Inspora">${icons.map(icon =>
      `<link rel="icon" href="${icon.url}" type="${icon.type}"${icon.media ? ` media="${icon.media}"` : ""}>`
    ).join("")}<script type="application/ld+json">${serializeJsonLd(buildWebsiteStructuredData())}</script>`;
    const fetcher = createMetadataFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async ({ url }) => url.pathname === "/"
        ? { status: 200, headers: { "content-type": "text/html" }, bytes: Buffer.from(html) }
        : { status: 200, headers: { "content-type": "image/png" }, bytes: await readFile(resolve("public", `.${url.pathname}`)) },
    });
    const result = await fetcher.suggest(SITE_URL);
    expect(result.title).toBe("Inspora");
    expect(result.iconUrl).toBe(`${SITE_URL}${SITE_ICON}`);
    expect(result.wordmarkUrl).toBe(`${SITE_URL}${SITE_WORDMARK}`);
    for (const [kind, url] of [["icon", result.iconUrl], ["wordmark", result.wordmarkUrl]] as const) {
      const asset = await fetcher.fetchPublic(url!, 1_000_000, AbortSignal.timeout(4000));
      const imported = await prepareWebsiteSuggestion(asset.bytes, "image/png", kind);
      expect(imported.contentType).toBe("image/png");
      expect(Buffer.from(imported.bytes)).toEqual(Buffer.from(asset.bytes));
    }
  });

  it("retains rejection of the styled SVG that previously failed import", async () => {
    const bytes = await readFile(resolve("public/brand/inspora-icon-v1.svg"));
    await expect(prepareWebsiteSuggestion(bytes, "image/svg+xml", "icon")).rejects.toThrow("Use a passive SVG drawing.");
  });
});
