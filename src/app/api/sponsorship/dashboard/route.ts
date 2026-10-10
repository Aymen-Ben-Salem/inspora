import { sponsorApiResponse } from "@/features/sponsorship/api-response";
import { readOwnSponsorDashboard } from "@/features/sponsorship/billing-service";
export async function GET() {
  return sponsorApiResponse(async () => {
    const value = await readOwnSponsorDashboard();
    return value
      ? { ok: true, value }
      : {
          ok: false,
          code: "forbidden",
          message: "Sign in with your sponsor identity to view billing.",
        };
  });
}
