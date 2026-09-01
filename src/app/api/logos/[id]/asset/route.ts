import { getPublishedLogoAsset } from "@/data/logos-repository";
import {
  getAttachmentDisposition,
  getLogoAssetFileName,
} from "@/lib/logo-asset";
import { getR2MediaAsset } from "@/storage/r2";

const ASSET_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = await getPublishedLogoAsset(id);

  if (!asset) {
    return Response.json({ message: "Logo not found." }, { status: 404 });
  }

  try {
    let bytes: Uint8Array;
    let contentType = asset.mimeType;

    if (asset.storageProvider === "r2" && asset.storageKey) {
      const object = await getR2MediaAsset(asset.storageKey);
      bytes = object.bytes;
      contentType = object.contentType ?? contentType;
    } else {
      const sourceUrl = new URL(asset.url, request.url);
      const response = await fetch(sourceUrl, { cache: "force-cache" });
      if (!response.ok) throw new Error("The source asset could not be loaded.");
      bytes = new Uint8Array(await response.arrayBuffer());
      contentType = response.headers.get("Content-Type") ?? contentType;
    }

    const normalizedContentType =
      contentType?.split(";", 1)[0]?.toLowerCase() ?? "application/octet-stream";
    const fileName = getLogoAssetFileName(asset.slug, normalizedContentType);

    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);

    return new Response(body, {
      headers: {
        "Cache-Control": ASSET_CACHE_CONTROL,
        "Content-Disposition": getAttachmentDisposition(fileName),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": normalizedContentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Published logo asset failed", error);
    return Response.json(
      { message: "Could not load the logo asset." },
      { status: 502 },
    );
  }
}
