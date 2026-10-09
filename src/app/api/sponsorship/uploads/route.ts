import { NextResponse } from "next/server";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { readSponsorJson } from "@/features/sponsorship/request-policy";
import {
  beginSponsorUpload,
  completeSponsorUpload,
} from "@/features/sponsorship/media";
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      {
        ok: true,
        value: await beginSponsorUpload(await readSponsorJson(request)),
      },
      { headers: sponsorPrivateHeaders },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Upload is unavailable. Check your file type, size and sponsor access.",
      },
      { status: 400, headers: sponsorPrivateHeaders },
    );
  }
}
export async function PUT(request: Request) {
  try {
    const input = (await readSponsorJson(request)) as { id: string };
    return NextResponse.json(
      { ok: true, value: await completeSponsorUpload(input.id) },
      { headers: sponsorPrivateHeaders },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Media verification failed. Check your file type, size and sponsor access.",
      },
      { status: 400, headers: sponsorPrivateHeaders },
    );
  }
}
