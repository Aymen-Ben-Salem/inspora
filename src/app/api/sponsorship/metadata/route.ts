import { NextResponse } from "next/server";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import { preparationService } from "@/features/sponsorship/service";
import { metadataFetcher } from "@/features/sponsorship/metadata";
import { importSponsorSuggestion } from "@/features/sponsorship/media";
export async function POST(request: Request) {
  try {
    const preparation = await preparationService.read();
    if (!preparation.ok)
      return NextResponse.json(preparation, {
        status: 403,
        headers: sponsorPrivateHeaders,
      });
    const { url } = (await readSponsorJson(request)) as { url: string };
    const signal = AbortSignal.timeout(4000);
    const suggestions = await metadataFetcher.suggest(url, signal);
    const value: {
      title?: string;
      iconId?: string;
      mediaId?: string;
      assets: import("@/features/sponsorship/types").VerifiedSponsorAsset[];
    } = { title: suggestions.title, assets: [] };
    for (const [href, kind] of [
      [suggestions.iconUrl, "icon"],
      [suggestions.imageUrl, "media"],
    ] as const) {
      if (!href) continue;
      try {
        const image = await metadataFetcher.fetchPublic(
          href,
          10 * 1024 * 1024,
          signal,
        );
        const contentType =
          image.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() ?? "";
        if (
          !contentType.startsWith("image/") ||
          contentType === "image/svg+xml"
        )
          continue;
        const asset = await importSponsorSuggestion(
          image.bytes,
          contentType,
          kind,
        );
        value[kind === "icon" ? "iconId" : "mediaId"] = asset.id;
        value.assets.push(asset);
      } catch {
        /* The sponsor can always supply their own media. */
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
