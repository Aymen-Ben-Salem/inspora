import { auth } from "@clerk/nextjs/server";
import { proSiteOrigin } from "@/features/pro/payment-environment";
import { createProAccountActionHandler } from "@/features/pro/account-actions";
import { proFeatureEnabled } from "@/features/pro/config";
import { proService } from "@/features/pro/server";

const handler = createProAccountActionHandler({
  identity: async () => ({ userId: (await auth()).userId }),
  service: proService,
  siteOrigin: () => proSiteOrigin(),
  enabled: () => proFeatureEnabled(),
});

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return handler(request, (await context.params).action);
}
