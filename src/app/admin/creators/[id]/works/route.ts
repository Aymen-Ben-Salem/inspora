import { requireAdmin } from "@/auth/require-admin";
import { getAdminCreatorWorkPage, InvalidAdminCreatorWorkQueryError } from "@/features/admin/creator-work-repository";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch {
    return Response.json({ message: "Sign in as an administrator to view this work." }, { status: 401, headers });
  }
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  try {
    return Response.json(await getAdminCreatorWorkPage({ creatorId: id, query: search.get("q") ?? "", cursor: search.get("cursor") }), { headers });
  } catch (error) {
    if (error instanceof InvalidAdminCreatorWorkQueryError) {
      return Response.json({ message: error.message }, { status: 400, headers });
    }
    console.error("Admin creator work could not be loaded", error);
    return Response.json({ message: "Work could not be loaded. Try again." }, { status: 500, headers });
  }
}
