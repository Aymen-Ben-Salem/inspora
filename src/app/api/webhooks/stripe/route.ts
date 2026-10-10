import { after } from "next/server";
import { recordStripeWebhook } from "@/features/sponsorship/webhook";
import { drainSponsorJobs } from "@/features/sponsorship/jobs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Missing body", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) return new Response("Body too large", { status: 413 });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    const result = await recordStripeWebhook(
      Buffer.concat(chunks).toString("utf8"),
      signature,
    );
    if (!result.accepted)
      return new Response("Invalid signature or environment", { status: 400 });
    after(async () => {
      try {
        await drainSponsorJobs();
      } catch {
        console.error("Sponsor billing work remains queued.");
      }
    });
    return new Response("Accepted", { status: 202 });
  } catch {
    return new Response("Billing receipt storage unavailable", { status: 503 });
  }
}
