import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runProfileCleanup } from "@/features/submissions/cleanup";

function validSecret(request: Request) {
  const expected = process.env.PROFILE_CLEANUP_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!validSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requested = Number(new URL(request.url).searchParams.get("batchSize") ?? 25);
  const batchSize = Number.isInteger(requested) ? Math.min(100, Math.max(1, requested)) : 25;
  const report = await runProfileCleanup(new Date(), batchSize);
  return NextResponse.json(report, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
