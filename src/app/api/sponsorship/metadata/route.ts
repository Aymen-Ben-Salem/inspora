import { NextResponse } from "next/server";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import {
  metadataFetcher,
  SPONSOR_METADATA_TIMEOUT_MS,
} from "@/features/sponsorship/metadata";
import {
  importSponsorSuggestion,
  requireSponsorMediaWriteAccess,
} from "@/features/sponsorship/media";
import { prepareWebsiteSuggestion } from "@/features/sponsorship/suggestion-images";
export async function POST(request: Request) {
  try {
    try {
      await requireSponsorMediaWriteAccess();
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          code: "forbidden",
          message:
            error instanceof Error
              ? error.message
              : "Verify sponsor access before uploading.",
        },
        { status: 403, headers: sponsorPrivateHeaders },
      );
    }
    const { url } = (await readSponsorJson(request)) as { url: string };
    const suggestions = await metadataFetcher.suggest(
      url,
      AbortSignal.timeout(SPONSOR_METADATA_TIMEOUT_MS),
    );
    const value: {
      title?: string;
      feedDescription?: string;
      iconId?: string;
      wordmarkId?: string;
      mediaId?: string;
      assets: import("@/features/sponsorship/types").VerifiedSponsorAsset[];
      missingAssets: string[];
    } = { title: suggestions.title, feedDescription: suggestions.feedDescription, assets: [], missingAssets: [] };
    const roles = [
      [suggestions.iconUrl, "icon"],
      [suggestions.imageUrl, "media"],
      [suggestions.wordmarkUrl, "wordmark"],
    ] as const;
    // Finish bounded website reads before private storage work. Storage must
    // not consume the deadline for fetching later website assets.
    const imageSignal = AbortSignal.timeout(4000);
    const images = await Promise.allSettled(
      roles.map(async ([href]) => {
        if (!href) throw new Error("Website asset not found.");
        return metadataFetcher.fetchPublic(href, 10 * 1024 * 1024, imageSignal);
      }),
    );
    for (const [index, [, kind]] of roles.entries()) {
      try {
        const fetched = images[index];
        if (fetched.status !== "fulfilled") throw fetched.reason;
        const image = fetched.value;
        const contentType =
          image.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() ?? "";
        const prepared = await prepareWebsiteSuggestion(
          image.bytes,
          contentType,
          kind,
        );
        const asset = await importSponsorSuggestion(
          prepared.bytes,
          prepared.contentType,
          kind,
        );
        const field = {
          icon: "iconId",
          wordmark: "wordmarkId",
          media: "mediaId",
        } as const;
        value[field[kind]] = asset.id;
        value.assets.push(asset);
      } catch {
        value.missingAssets.push(kind === "media" ? "OG image" : kind);
      }
    }
    return NextResponse.json(
      { ok: true, value },
      { headers: sponsorPrivateHeaders },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Suggestions are unavailable. Continue with manual fields and uploads.",
      },
      { status: 422, headers: sponsorPrivateHeaders },
    );
  }
}
