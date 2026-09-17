import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getSavedPostIdsForUser,
  MAX_SAVED_STATUS_IDS,
} from "@/data/saved-posts-repository";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

const idsSchema = z.array(z.string().uuid()).max(MAX_SAVED_STATUS_IDS);

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { message: "Sign in to view saved posts." },
      { status: 401, headers: privateHeaders },
    );
  }

  const ids = Array.from(new URL(request.url).searchParams.getAll("id"));
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid post IDs." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const savedPostIds = await getSavedPostIdsForUser(userId, parsed.data);
    return NextResponse.json(
      { savedPostIds },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Saved-post status lookup failed", error);
    return NextResponse.json(
      { message: "Could not load saved-post status." },
      { status: 500, headers: privateHeaders },
    );
  }
}
