import { getPublishedWebsiteAsset } from "@/data/websites-repository";
import { getAttachmentDisposition } from "@/lib/logo-asset";
import { getR2MediaAsset } from "@/storage/r2";

const ASSET_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

function extensionFor(contentType: string) {
  return ({
    "image/avif": "avif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  } as Record<string, string>)[contentType] ?? "img";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = await getPublishedWebsiteAsset(id);
  if (!asset) return Response.json({ message: "Website not found." }, { status: 404 });

  try {
    let bytes: Uint8Array;
    let contentType = asset.mimeType;
    if (asset.storageProvider === "r2" && asset.storageKey) {
      const object = await getR2MediaAsset(asset.storageKey);
      bytes = object.bytes;
      contentType = object.contentType ?? contentType;
    } else {
      const response = await fetch(new URL(asset.url, request.url), { cache: "force-cache" });
      if (!response.ok) throw new Error("The source screenshot could not be loaded.");
      bytes = new Uint8Array(await response.arrayBuffer());
      contentType = response.headers.get("Content-Type") ?? contentType;
    }
    const normalizedType = contentType?.split(";", 1)[0]?.toLowerCase() ?? "application/octet-stream";
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Cache-Control": ASSET_CACHE_CONTROL,
        "Content-Disposition": getAttachmentDisposition(`${asset.slug}-website.${extensionFor(normalizedType)}`),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": normalizedType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Published website asset failed", error);
    return Response.json({ message: "Could not load the website screenshot." }, { status: 502 });
  }
}
