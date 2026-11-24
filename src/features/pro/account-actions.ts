import { ProBillingError, type ProService } from "./service";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const messages: Record<ProBillingError["code"], [number, string]> = {
  already_active: [409, "Your Inspora Pro subscription is already active."],
  no_subscription: [409, "No current Inspora Pro subscription was found."],
  closed: [409, "This account has been closed."],
  unavailable: [503, "Billing is temporarily unavailable. Try again."],
};

export function createProAccountActionHandler(deps: { identity: () => Promise<{ userId: string | null }>; service: () => ProService; siteOrigin: () => string; enabled: () => boolean }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  return async (request: Request, action: string) => {
    if (!deps.enabled()) return reply({ message: "Not found" }, 404);
    if (request.method !== "POST" || request.headers.get("origin") !== deps.siteOrigin()) return reply({ message: "Request could not be verified." }, 403);
    const { userId } = await deps.identity();
    if (!userId) return reply({ message: "Sign in to manage Inspora Pro." }, 401);
    const raw = await request.text();
    if (raw.length > 1024) return reply({ message: "Request too large." }, 413);
    const service = deps.service();
    try {
      switch (action) {
        case "subscribe": return reply({ url: (await service.startSubscription(userId)).url });
        case "portal": return reply({ url: await service.portal(userId) });
        case "cancel-renewal": await service.setRenewal(userId, true); return reply({ ok: true });
        case "resume-renewal": await service.setRenewal(userId, false); return reply({ ok: true });
        default: return reply({ message: "Not found" }, 404);
      }
    } catch (error) {
      if (error instanceof ProBillingError) { const [status, message] = messages[error.code]; return reply({ message, code: error.code }, status); }
      return reply({ message: messages.unavailable[1] }, 503);
    }
  };
}
