import { z } from "zod";
import { requireAdmin } from "@/auth/require-admin";
import {
  completeMediaUploadAction,
  createMediaUploadSignatureAction,
  discardMediaUploadsAction,
  getMediaConverterConfigurationAction,
} from "@/features/admin/media-actions";

const requestSchema = z.object({
  operation: z.enum(["sign", "complete", "discard", "converter"]),
  input: z.unknown().optional(),
});
const headers = { "Cache-Control": "private, no-store" };
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ message: "Upload requests must come from this site." }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ message: "Upload requests must use JSON." }, 415);
  }
  try {
    await requireAdmin();
  } catch {
    return json({ message: "Please sign in as an administrator and retry the upload." }, 401);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "The upload request is invalid." }, 400);

  try {
    switch (parsed.data.operation) {
      case "sign": return json(await createMediaUploadSignatureAction(parsed.data.input));
      case "complete": return json(await completeMediaUploadAction(parsed.data.input));
      case "discard":
        // The existing action validates kind, count and every key before deleting.
        await discardMediaUploadsAction(parsed.data.input);
        return json({ ok: true });
      case "converter": return json(await getMediaConverterConfigurationAction());
    }
  } catch {
    return json({ message: "The upload request could not be completed. Please retry." }, 500);
  }
}
