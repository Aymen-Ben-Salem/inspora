import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredAdminUserIds } from "@/auth/config";
import { findAuthorizedSubmissionMedia } from "@/features/submissions/repository";
import { readPrivateUpload } from "@/storage/private-submissions";

const idSchema = z.uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 404 });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return new NextResponse(null, { status: 404 });
  const media = await findAuthorizedSubmissionMedia(id, userId, getConfiguredAdminUserIds().has(userId));
  if (!media) return new NextResponse(null, { status: 404 });
  const stored = await readPrivateUpload(media.objectKey);
  if (!stored) return new NextResponse(null, { status: 404 });
  return new NextResponse(Uint8Array.from(stored.bytes).buffer, { headers: {
    "Content-Type": stored.contentType,
    "Cache-Control": stored.cacheControl,
    "X-Content-Type-Options": "nosniff",
  } });
}
