import "server-only";
import { sponsorPrivateHeaders } from "./config";
import type { SponsorshipResult } from "./types";
export async function sponsorApiResponse(
  work: () => Promise<SponsorshipResult<unknown>>,
) {
  try {
    const result = await work();
    const status = result.ok
      ? 200
      : {
          unauthenticated: 401,
          forbidden: 403,
          invalid_input: 400,
          conflict: 409,
          expired: 410,
          capacity_full: 409,
          unavailable: 503,
        }[result.code];
    return Response.json(result, { status, headers: sponsorPrivateHeaders });
  } catch {
    return Response.json(
      {
        ok: false,
        code: "unavailable",
        message:
          "Sponsorship is temporarily unavailable. Saved state is retained; try again.",
      },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
