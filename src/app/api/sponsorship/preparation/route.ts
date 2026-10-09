import { NextResponse } from "next/server";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import {
  assertSponsorWriteRequest,
  readSponsorJson,
} from "@/features/sponsorship/request-policy";
import {
  beginSponsorPreparation,
  preparationService,
  saveOwnCampaign,
} from "@/features/sponsorship/service";
async function respond(work: () => Promise<unknown>) {
  try {
    const result = (await work()) as { ok: boolean; code?: string };
    return NextResponse.json(result, {
      status: result.ok
        ? 200
        : result.code === "unauthenticated"
          ? 401
          : result.code === "forbidden"
            ? 403
            : result.code === "expired"
              ? 410
              : result.code === "conflict"
                ? 409
                : 400,
      headers: sponsorPrivateHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "unavailable",
        message: "Your preparation could not be loaded or saved. Try again.",
      },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
export async function GET() {
  return respond(() => preparationService.read());
}
export async function POST(request: Request) {
  return respond(async () => {
    assertSponsorWriteRequest(request);
    return beginSponsorPreparation();
  });
}
export async function PUT(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    return NextResponse.json(
      { ok: false, code: "invalid_input", message: "Request is too large." },
      { status: 413, headers: sponsorPrivateHeaders },
    );
  return respond(async () => saveOwnCampaign(await readSponsorJson(request)));
}
