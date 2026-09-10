import { getPublishedWebsiteAsset } from "@/data/websites-repository";
import { getAttachmentDisposition } from "@/lib/logo-asset";
import { getWebsiteSectionFileName } from "@/lib/website-media-actions";
import { getR2MediaAsset } from "@/storage/r2";

const ASSET_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

function normalizedType(contentType: string | null | undefined) {
  return contentType?.split(";", 1)[0]?.toLowerCase() ?? "application/octet-stream";
}

function recordingFileName(slug: string, contentType: string | null | undefined) {
  const extension = normalizedType(contentType) === "video/webm" ? "webm" : "mp4";
  return `${slug}-website.${extension}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sectionId = new URL(request.url).searchParams.get("section") ?? undefined;
  const asset = await getPublishedWebsiteAsset(id, sectionId);
  if (!asset) {
    return Response.json({ message: "Website not found." }, { status: 404 });
  }

  try {
    if (asset.kind === "recording") {
      const range = request.headers.get("Range");
      const response = await fetch(new URL(asset.url, request.url), {
        cache: "no-store",
        headers: range ? { Range: range } : undefined,
      });
      if (!response.ok) throw new Error("The recording could not be loaded.");

      const type = normalizedType(
        response.headers.get("Content-Type") ?? asset.mimeType,
      );
      const headers = new Headers({
        "Cache-Control": ASSET_CACHE_CONTROL,
        "Content-Disposition": getAttachmentDisposition(
          recordingFileName(asset.slug, type),
        ),
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
      });
      for (const name of [
        "Accept-Ranges",
        "Content-Length",
        "Content-Range",
        "ETag",
        "Last-Modified",
      ]) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }

      return new Response(response.body, {
        headers,
        status: response.status,
      });
    }

    let bytes: Uint8Array;
    let contentType = asset.mimeType;
    if (asset.storageProvider === "r2" && asset.storageKey) {
      const object = await getR2MediaAsset(asset.storageKey);
      bytes = object.bytes;
      contentType = object.contentType ?? contentType;
    } else {
      const response = await fetch(new URL(asset.url, request.url), {
        cache: "force-cache",
      });
      if (!response.ok) throw new Error("The section image could not be loaded.");
      bytes = new Uint8Array(await response.arrayBuffer());
      contentType = response.headers.get("Content-Type") ?? contentType;
    }

    const type = normalizedType(contentType);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Cache-Control": ASSET_CACHE_CONTROL,
        "Content-Disposition": getAttachmentDisposition(
          getWebsiteSectionFileName(asset.slug, asset.label, type),
        ),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Published website asset failed", error);
    return Response.json(
      { message: "Could not load the website asset." },
      { status: 502 },
    );
  }
}
