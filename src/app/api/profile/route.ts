import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ensureCreatorForOwner } from "@/features/creators/identity";
import { updateOwnProfile } from "@/features/profiles/actions";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { message: "Sign in to view your profile." },
      { status: 401, headers: privateHeaders },
    );
  }
  try {
    return NextResponse.json(await ensureCreatorForOwner({ userId }), {
      headers: privateHeaders,
    });
  } catch (error) {
    console.error("Owner profile lookup failed", error);
    return NextResponse.json(
      { message: "Your profile could not be loaded." },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function PATCH(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", field: "form", message: "Invalid profile request." },
      { status: 400, headers: privateHeaders },
    );
  }
  const result = await updateOwnProfile(input as never);
  return NextResponse.json(result, {
    status: result.ok ? 200 : result.code === "unauthenticated" ? 401 : 400,
    headers: privateHeaders,
  });
}
