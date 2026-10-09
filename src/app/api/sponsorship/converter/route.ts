import { NextResponse } from "next/server";
import { verifiedSponsorOwner } from "@/features/sponsorship/authorization";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
import { getR2PublicUrl } from "@/storage/r2";
export async function GET() {
  if (!(await verifiedSponsorOwner()))
    return NextResponse.json(
      { message: "Verify sponsor access." },
      { status: 401, headers: sponsorPrivateHeaders },
    );
  const base = getR2PublicUrl("system/ffmpeg/0.12.10");
  return NextResponse.json(
    { coreUrl: `${base}/ffmpeg-core.js`, wasmUrl: `${base}/ffmpeg-core.wasm` },
    { headers: sponsorPrivateHeaders },
  );
}
