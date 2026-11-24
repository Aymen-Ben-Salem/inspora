import { sponsorMaintenanceAuthorized } from "@/features/sponsorship/jobs";
import { proFeatureEnabled, proStripeConfig } from "@/features/pro/config";
import { proService, withProTransaction } from "@/features/pro/server";
import { proRecoverySchemaInstalled } from "@/features/pro/repository";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

/** Retries pending Pro provider closures. Same cron secret as other maintenance. */
export async function GET(request: Request) {
  if (!sponsorMaintenanceAuthorized(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const enabled = proFeatureEnabled();
  // A private authenticated recovery path remains available when the public
  // Pro surface is disabled, but it only cancels billing for closed accounts.
  if (!proStripeConfig()) return Response.json({ error: "Not found" }, { status: 404, headers });
  try {
    if (!(await withProTransaction(proRecoverySchemaInstalled))) return Response.json(enabled ? { error: "Maintenance schema unavailable" } : { ok: true, skipped: true }, { status: enabled ? 503 : 200, headers });
    await proService().maintenance();
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "Maintenance pending retry" }, { status: 503, headers });
  }
}
