import {
  sponsorMaintenanceAuthorized,
  runSponsorMaintenance,
} from "@/features/sponsorship/jobs";
import { sponsorPrivateHeaders } from "@/features/sponsorship/config";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!sponsorMaintenanceAuthorized(request.headers.get("authorization")))
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: sponsorPrivateHeaders },
    );
  try {
    return Response.json(await runSponsorMaintenance(), {
      headers: sponsorPrivateHeaders,
    });
  } catch {
    return Response.json(
      { error: "Maintenance pending retry" },
      { status: 503, headers: sponsorPrivateHeaders },
    );
  }
}
