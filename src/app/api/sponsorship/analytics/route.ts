import {
  readOwnAnalyticsCatalog,
  readOwnSponsorMetrics,
} from "@/features/sponsorship/analytics";
import { sponsorReportRequest } from "@/features/sponsorship/analytics-service";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};
export async function GET(request: Request) {
  try {
    const { filter, refresh, catalog } = sponsorReportRequest(request);
    const data = await readOwnSponsorMetrics(filter, refresh);
    return Response.json(
      {
        data,
        ...(catalog
          ? { catalog: await readOwnAnalyticsCatalog() }
          : {}),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { message: "Sponsor report access unavailable." },
      { status: 403, headers },
    );
  }
}
