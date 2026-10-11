import { AnalyticsInputError } from "@/analytics/first-party/collector";
import { AnalyticsRateError } from "@/analytics/first-party/store";
import { acceptAnalyticsBatch } from "@/analytics/first-party/service";
import { readAnalyticsJson } from "@/analytics/first-party/http";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex",
};
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ message: "Forbidden." }, { status: 403, headers });
  try {
    const input = await readAnalyticsJson(request, 20480);
    return Response.json(await acceptAnalyticsBatch(request, input), {
      headers,
    });
  } catch (error) {
    const status =
      error instanceof AnalyticsInputError
        ? error.message === "Batch too large."
          ? 413
          : 400
        : error instanceof AnalyticsRateError
          ? 429
          : 503;
    return Response.json(
      {
        message:
          status === 503
            ? "Analytics unavailable."
            : status === 429
              ? "Analytics rate limit."
              : "Invalid analytics event.",
      },
      { status, headers },
    );
  }
}
