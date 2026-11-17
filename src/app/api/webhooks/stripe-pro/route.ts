import { proWebhookReceiver } from "@/features/pro/server";

// Dedicated Pro endpoint and signing secret; the sponsorship webhook is unchanged.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const raw = await request.text();
  if (raw.length > 262144) return new Response("Body too large", { status: 413 });
  let receiver;
  try { receiver = proWebhookReceiver(); } catch { return new Response("Not found", { status: 404 }); }
  try {
    const result = await receiver(raw, signature);
    return new Response(result.status === 400 ? "Invalid signature or environment" : result.status === 500 ? "Retry" : "Accepted", { status: result.status });
  } catch {
    return new Response("Billing receipt storage unavailable", { status: 503 });
  }
}
