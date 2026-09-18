import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getPublishedCreatorWorkPage,
  isCreatorWorkFilter,
} from "@/features/profiles/repository";

const publicHeaders = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=21600",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid creator." }, { status: 400 });
  }
  const searchParams = new URL(request.url).searchParams;
  const filter = searchParams.get("filter") ?? "all";
  const cursor = searchParams.get("cursor") ?? undefined;
  if (!isCreatorWorkFilter(filter)) {
    return NextResponse.json({ message: "Unsupported profile filter." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await getPublishedCreatorWorkPage({ creatorId: id, filter, cursor }),
      { headers: publicHeaders },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid creator-work cursor.") {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("Creator work pagination failed", error);
    return NextResponse.json(
      { message: "More work could not be loaded." },
      { status: 500 },
    );
  }
}
