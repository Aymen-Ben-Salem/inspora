export const CATALOG_HOST: string;
export const CATALOG_PATH: string;
export const ENRICHMENT_KEY: string;
export function createHostedFeed(options: {
  capture(): Promise<{capturedAt: string; rows: Record<string, unknown>[]} >;
  readEnrichment(): Promise<unknown>;
  token?: string;
  now?: () => number;
}): (request: Request) => Promise<Response>;
