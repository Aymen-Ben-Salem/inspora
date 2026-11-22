import { readAdminPromotions, saveAdminPromotions } from "@/features/sponsorship/promotions";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
const status = { invalid_input: 400, conflict: 409, forbidden: 403 } as const;
type Context = { params: Promise<{ accountId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    return Response.json({ ok: true, value: await readAdminPromotions((await context.params).accountId) }, { headers });
  } catch {
    return Response.json({ ok: false, message: "Sponsor account unavailable." }, { status: 403, headers });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const result = await saveAdminPromotions((await context.params).accountId, await request.json());
    return Response.json(result, { status: result.ok ? 200 : status[result.code], headers });
  } catch {
    return Response.json({ ok: false, message: "Promotions can’t be changed right now." }, { status: 403, headers });
  }
}
