import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { readAccountCapabilities } from "@/features/sponsorship/authorization";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json(
      { message: "Sign in." },
      { status: 401, headers: sponsorPrivateHeaders },
    );
  try {
    return NextResponse.json(await readAccountCapabilities(userId), {
      headers: sponsorPrivateHeaders,
    });
  } catch {
    return NextResponse.json(
      { message: "Account access is unavailable." },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
