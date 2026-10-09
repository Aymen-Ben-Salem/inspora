import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  sponsorshipWritesEnabled,
  sponsorPrivateHeaders,
} from "@/features/sponsorship/config";
import {
  signSponsorIntent,
  SPONSOR_INTENT_COOKIE,
} from "@/features/sponsorship/onboarding";
export async function GET(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!sponsorshipWritesEnabled() || !secret)
    return NextResponse.json(
      { message: "Sponsor access is currently unavailable." },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  const { userId } = await auth();
  const response = NextResponse.redirect(
    new URL("/sponsor/access", request.url),
  );
  response.cookies.set(
    SPONSOR_INTENT_COOKIE,
    signSponsorIntent(secret, Date.now() + 86400000, userId),
    {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    },
  );
  for (const [key, value] of Object.entries(sponsorPrivateHeaders))
    response.headers.set(key, value);
  return response;
}
