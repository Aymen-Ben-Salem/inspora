import { capturePublicCatalog, readCatalogEnrichment } from "@/features/inspora-catalog/source";
import { createHostedFeed } from "../../../../../tools/inspora-mcp/hosted-feed.mjs";

export const maxDuration = 30;

export async function GET(request: Request) {
  return createHostedFeed({
    capture: capturePublicCatalog,
    readEnrichment: readCatalogEnrichment,
    token: process.env.INSPORA_CATALOG_TOKEN,
  })(request);
}
