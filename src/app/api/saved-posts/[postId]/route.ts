import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  savePostForUser,
  SavedPostUnavailableError,
  unsavePostForUser,
} from "@/data/saved-posts-repository";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

const postIdSchema = z.string().uuid();
type RouteContext = { params: Promise<{ postId: string }> };

async function authenticatedPostId(context: RouteContext) {
  const [{ userId }, { postId }] = await Promise.all([auth(), context.params]);
  const parsed = postIdSchema.safeParse(postId);
  return { userId, postId: parsed.success ? parsed.data : null };
}

export async function POST(_request: Request, context: RouteContext) {
  const { userId, postId } = await authenticatedPostId(context);
  if (!userId) {
    return NextResponse.json(
      { message: "Sign in to save posts." },
      { status: 401, headers: privateHeaders },
    );
  }
  if (!postId) {
    return NextResponse.json(
      { message: "Invalid post ID." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    await savePostForUser(userId, postId);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof SavedPostUnavailableError) {
      return NextResponse.json(
        { message: error.message },
        { status: 404, headers: privateHeaders },
      );
    }
    console.error("Saving post failed", error);
    return NextResponse.json(
      { message: "Could not save this post." },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId, postId } = await authenticatedPostId(context);
  if (!userId) {
    return NextResponse.json(
      { message: "Sign in to update saved posts." },
      { status: 401, headers: privateHeaders },
    );
  }
  if (!postId) {
    return NextResponse.json(
      { message: "Invalid post ID." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    await unsavePostForUser(userId, postId);
    return NextResponse.json({ saved: false }, { headers: privateHeaders });
  } catch (error) {
    console.error("Removing saved post failed", error);
    return NextResponse.json(
      { message: "Could not remove this saved post." },
      { status: 500, headers: privateHeaders },
    );
  }
}
