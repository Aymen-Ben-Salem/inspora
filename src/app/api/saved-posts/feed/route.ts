import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  decodeSavedPostCursor,
  getSavedPostPage,
} from "@/data/saved-posts-repository";
import { isSavedCategory } from "@/domain/saved-post";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { message: "Sign in to view saved posts." },
      { status: 401, headers: privateHeaders },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const rawCategory = searchParams.get("category");
  const cursor = searchParams.get("cursor");
  if (rawCategory && !isSavedCategory(rawCategory)) {
    return NextResponse.json(
      { message: "Unsupported category." },
      { status: 400, headers: privateHeaders },
    );
  }
  if (cursor && !decodeSavedPostCursor(cursor)) {
    return NextResponse.json(
      { message: "Invalid saved-post cursor." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const page = await getSavedPostPage({
      userId,
      category:
        rawCategory && isSavedCategory(rawCategory) ? rawCategory : undefined,
      cursor,
    });
    return NextResponse.json(page, { headers: privateHeaders });
  } catch (error) {
    console.error("Saved-post pagination failed", error);
    return NextResponse.json(
      { message: "Could not load more saved posts." },
      { status: 500, headers: privateHeaders },
    );
  }
}
