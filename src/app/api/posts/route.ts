import { NextResponse } from "next/server";

import { decodePostCursor } from "@/data/post-pagination";
import { getPostPage } from "@/data/posts-repository";
import { isPostCategory, isPostView } from "@/domain/post";

const PAGE_CACHE_CONTROL =
  "public, max-age=120, s-maxage=300, stale-while-revalidate=3600";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const rawCategory = searchParams.get("category");
  const rawView = searchParams.get("view") ?? "latest";
  const rawCursor = searchParams.get("cursor");

  if (rawCategory && !isPostCategory(rawCategory)) {
    return NextResponse.json({ message: "Unsupported category." }, { status: 400 });
  }

  if (!isPostView(rawView)) {
    return NextResponse.json({ message: "Unsupported post view." }, { status: 400 });
  }

  if (rawCursor && !decodePostCursor(rawCursor)) {
    return NextResponse.json({ message: "Invalid pagination cursor." }, { status: 400 });
  }

  try {
    const page = await getPostPage({
      category: rawCategory && isPostCategory(rawCategory) ? rawCategory : undefined,
      view: rawView,
      cursor: rawCursor || undefined,
    });

    return NextResponse.json(page, {
      headers: { "Cache-Control": PAGE_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("Post pagination failed", error);
    return NextResponse.json(
      { message: "Could not load more posts." },
      { status: 500 },
    );
  }
}
