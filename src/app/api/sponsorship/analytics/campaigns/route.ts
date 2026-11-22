import { readOwnCampaignComparison } from "@/features/sponsorship/campaign-comparison";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function GET() {
  try {
    return Response.json({ campaigns: await readOwnCampaignComparison() }, { headers });
  } catch {
    return Response.json({ message: "Sponsor report access unavailable." }, { status: 403, headers });
  }
}
