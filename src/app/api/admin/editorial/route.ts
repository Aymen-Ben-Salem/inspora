import { requireAdmin } from "@/auth/require-admin";
import { generateEditorial } from "@/features/admin/editorial-service";
import { recordEditorialDecision } from "@/features/admin/editorial-review";

export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
async function handle(request: Request, decision: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin access required." }, { status: 403, headers });
  let userId: string;
  try { ({ userId } = await requireAdmin()); }
  catch { return Response.json({ error: "Admin access required." }, { status: 403, headers }); }
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing request body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > (decision ? 4000 : 3_800_000)) { await reader.cancel(); return Response.json({ error: "The visual samples are too large." }, { status: 413, headers }); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = decision ? await recordEditorialDecision(body, userId) : await generateEditorial(body, userId);
    return Response.json(result, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(The editorial spending limit|Editorial generation is not configured|Editorial generation needs|A generation is already|This generation is already|That attempt did not|Generation failed|Generation was declined|Work context is too large|Use JPEG visual samples|Visual samples must)/.test(message);
    return Response.json({ error: safe ? message : "Suggestions could not be prepared. Check the work and visual evidence before trying again." }, { status: 400, headers });
  }
}
export const POST = (request: Request) => handle(request, false);
export const PATCH = (request: Request) => handle(request, true);
