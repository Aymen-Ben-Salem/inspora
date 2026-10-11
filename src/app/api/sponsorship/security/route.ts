import { NextResponse } from "next/server";
import { readSponsorSecurity } from "@/features/sponsorship/security";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";

export async function GET() {
  try {
    const { state } = await readSponsorSecurity();
    return NextResponse.json({ state }, { headers: sponsorPrivateHeaders });
  } catch {
    return NextResponse.json(
      { message: "Your account security could not be checked. Try again." },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
