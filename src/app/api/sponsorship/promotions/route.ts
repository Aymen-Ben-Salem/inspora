import { readOwnPromotions, saveOwnPromotions } from "@/features/sponsorship/promotions";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
const status = { invalid_input: 400, conflict: 409, forbidden: 403 } as const;

export async function GET() {
  try {
    return Response.json({ ok: true, value: await readOwnPromotions() }, { headers });
  } catch {
    return Response.json({ ok: false, message: "Sponsor access unavailable." }, { status: 403, headers });
  }
}

export async function PUT(request: Request) {
  try {
    const result = await saveOwnPromotions(await request.json());
    return Response.json(result, { status: result.ok ? 200 : status[result.code], headers });
  } catch {
    return Response.json({ ok: false, message: "Promotions can’t be changed right now." }, { status: 403, headers });
  }
}
