import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { requestWebhookAccountDeletion } from "@/features/profiles/account-lifecycle";

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
  if (event.type !== "user.deleted") return new Response("Ignored", { status: 200 });

  const userId = event.data.id;
  const eventId = request.headers.get("svix-id");
  if (!userId || !eventId) return new Response("Invalid webhook payload", { status: 400 });
  await requestWebhookAccountDeletion({ eventId, userId });
  return new Response("Accepted", { status: 202 });
}
