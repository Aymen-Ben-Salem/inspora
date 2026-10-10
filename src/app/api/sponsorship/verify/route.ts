import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/auth/config";
import { readAccountCapabilities } from "@/features/sponsorship/authorization";
import { beginSponsorPreparation } from "@/features/sponsorship/service";
import { readSponsorAccountForOwner } from "@/features/sponsorship/repository";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { SPONSOR_INTENT_COOKIE } from "@/features/sponsorship/onboarding";
export async function GET(request: Request) {
  try {
    if (!isClerkConfigured())
      throw new Error("Sponsor verification unavailable.");
    const { userId } = await auth();
    if (!userId)
      return NextResponse.redirect(
        new URL("/api/sponsorship/intent", request.url),
      );
    const capabilities = await readAccountCapabilities(userId);
    const account = await readSponsorAccountForOwner(userId);
    const returning = Boolean(
      account &&
      capabilities.sponsor &&
      ["active", "recovery", "inactive"].includes(account.state),
    );
    const p = returning ? null : await beginSponsorPreparation();
    if (p && !p.ok && p.code !== "conflict")
      return NextResponse.json(p, {
        status: 403,
        headers: sponsorPrivateHeaders,
      });
    const response = NextResponse.redirect(
      new URL(
        returning || (p && !p.ok && p.code === "conflict")
          ? "/sponsor/dashboard"
          : "/sponsor/start",
        request.url,
      ),
    );
    response.cookies.delete(SPONSOR_INTENT_COOKIE);
    for (const [key, value] of Object.entries(sponsorPrivateHeaders))
      response.headers.set(key, value);
    return response;
  } catch {
    return NextResponse.json(
      { message: "Your sponsor access could not be verified. Try again." },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
