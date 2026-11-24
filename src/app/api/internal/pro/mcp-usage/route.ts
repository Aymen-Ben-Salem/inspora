import { proSiteOrigin } from "@/features/pro/payment-environment";
import { proFeatureEnabled } from "@/features/pro/config";
import { createMcpUsageHandler } from "@/features/pro/mcp-usage";
import { isMcpTrialUser, withProTransaction } from "@/features/pro/server";

export async function POST(request: Request) {
  if (!proFeatureEnabled()) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return createMcpUsageHandler({
    token: process.env.INSPORA_PRO_USAGE_TOKEN,
    withTx: withProTransaction,
    isTrialUser: isMcpTrialUser,
    manageUrl: `${proSiteOrigin()}/account/pro`,
  })(request);
}
