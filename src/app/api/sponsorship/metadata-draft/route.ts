import { NextResponse } from "next/server";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import { destinationSchema } from "@/features/sponsorship/validation";
import { metadataFetcher, SPONSOR_METADATA_TIMEOUT_MS } from "@/features/sponsorship/metadata";
import { prepareWebsiteSuggestion } from "@/features/sponsorship/suggestion-images";
import { reserveDraftSuggestion } from "@/features/sponsorship/draft-suggestion-budget";
import type { DraftWebsiteSuggestions } from "@/features/sponsorship/draft-suggestions";

export const maxDuration = 40;
// Three base64 payloads plus metadata stay below Vercel's 4.5MB response limit.
const maxImageBytes = 1_000_000;

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    const input = await readSponsorJson(request, 4096);
    const url = destinationSchema.parse((input as { url?: unknown } | null)?.url);
    const reservation = reserveDraftSuggestion(request);
    if (!reservation) return NextResponse.json({ ok: false, message: "Please wait a minute before trying website suggestions again." },
      { status: 429, headers: { ...sponsorPrivateHeaders, "Retry-After": "60" } });
    release = reservation;
    const suggestions = await metadataFetcher.suggest(url, AbortSignal.any([request.signal, AbortSignal.timeout(SPONSOR_METADATA_TIMEOUT_MS)]));
    const value: DraftWebsiteSuggestions = { title: suggestions.title, feedDescription: suggestions.feedDescription, files: [], missingAssets: [] };
    const roles = [[suggestions.iconUrl, "icon"], [suggestions.imageUrl, "media"], [suggestions.wordmarkUrl, "wordmark"]] as const;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(4000)]);
    const images = await Promise.allSettled(roles.map(async ([href, kind]) => {
      if (!href) throw new Error("Website asset not found.");
      const image = await metadataFetcher.fetchPublic(href, maxImageBytes, signal);
      const type = image.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
      const prepared = await prepareWebsiteSuggestion(image.bytes, type, kind);
      if (!prepared.bytes.length || prepared.bytes.length > maxImageBytes) throw new Error("Use a manual upload for this image.");
      request.signal.throwIfAborted();
      return { kind, contentType: prepared.contentType, base64: Buffer.from(prepared.bytes).toString("base64") };
    }));
    for (const [index, result] of images.entries()) {
      if (result.status === "fulfilled") value.files.push(result.value);
      else value.missingAssets.push(roles[index][1] === "media" ? "OG image" : roles[index][1]);
    }
    request.signal.throwIfAborted();
    // No sponsor account, preparation, upload, or private storage is created.
    return NextResponse.json({ ok: true, value }, { headers: sponsorPrivateHeaders });
  } catch {
    return NextResponse.json({ ok: false, message: "Suggestions are unavailable. Continue with manual fields and uploads." },
      { status: 422, headers: sponsorPrivateHeaders });
  } finally { release?.(); }
}
