import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { readOwnSponsorAsset } from "@/features/sponsorship/media";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const asset = await readOwnSponsorAsset((await params).id);
    if (!asset)
      return new Response(null, {
        status: 404,
        headers: sponsorPrivateHeaders,
      });
    return new Response(Buffer.from(asset.bytes), {
      headers: {
        ...sponsorPrivateHeaders,
        "Content-Type": asset.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: sponsorPrivateHeaders });
  }
}
