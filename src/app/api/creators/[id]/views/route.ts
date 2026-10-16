import { z } from "zod";
import { getCreatorViews } from "@/analytics/creator-views";
import { getCreatorSummary } from "@/features/creators/identity";

const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_request: Request, { params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ message: "Invalid creator." }, { status: 400, headers });
  }
  const checkedAt = new Date().toISOString();
  // Shared server caching bounds provider queries. Browser/CDN caches must not
  // add another stale copy on top of the timestamped aggregate.
  try {
    const creator = await getCreatorSummary(id);
    if (!creator?.username) {
      return Response.json({ status: "unavailable", checkedAt }, { status: 404, headers });
    }
    const views = await getCreatorViews(id);
    return Response.json(views.status === "unavailable" ? { ...views, checkedAt } : views, {
      status: views.status === "unavailable" ? 503 : 200,
      headers,
    });
  } catch {
    return Response.json({ status: "unavailable", checkedAt }, { status: 503, headers });
  }
}
