import { getActiveSponsors } from "@/data/sponsor-repository";
export async function GET() {
  try {
    const sponsors = await getActiveSponsors();
    return Response.json(
      { sponsors, serverTime: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { message: "Public sponsorship is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
