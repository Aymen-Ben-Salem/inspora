import {
  getLiveVisitorAnalytics,
  isPostHogAdminConfigured,
} from "@/analytics/posthog-repository";
import { requireAdmin } from "@/auth/require-admin";

export async function GET() {
  await requireAdmin();

  if (!isPostHogAdminConfigured()) {
    return Response.json(
      { error: "PostHog admin analytics is not configured." },
      { status: 503 },
    );
  }

  try {
    const analytics = await getLiveVisitorAnalytics();

    return Response.json(analytics, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Live visitor query failed", error);
    return Response.json(
      { error: "Live visitor analytics are temporarily unavailable." },
      { status: 502 },
    );
  }
}
