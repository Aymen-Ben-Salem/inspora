import { readAdminSponsorReport } from "@/analytics/first-party/admin";
import { sponsorReportRequest } from "@/features/sponsorship/analytics-service";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: Request, context: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await context.params;
    const report = await readAdminSponsorReport(accountId, sponsorReportRequest(request));
    return Response.json(report, { headers });
  } catch {
    return Response.json({ message: "Sponsor report access unavailable." }, { status: 403, headers });
  }
}
