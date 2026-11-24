import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readAccess } from "./repository";
import type { WithProTransaction } from "./service";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const requestSchema = z.object({ action: z.literal("access"), userId: z.string().regex(/^user_[A-Za-z0-9]{1,100}$/) }).strict();

export type McpUsageDeps = {
  token: string | undefined;
  withTx: WithProTransaction;
  /** Approved nonbillable team trial (site admins and the explicit MCP trial allowlist). */
  isTrialUser: (userId: string) => boolean;
  manageUrl: string;
  now?: () => Date;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Private boundary between the hosted MCP Worker and the shared Pro service.
 * Returns only the current access state and a management link: never payment,
 * card or account details. Fair-use limits are enforced by the Worker.
 */
export function createMcpUsageHandler(deps: McpUsageDeps) {
  const now = deps.now ?? (() => new Date());
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  return async (request: Request) => {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(deps.token ?? "")) return reply({ error: "Not found" }, 404);
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${deps.token}`))) return reply({ error: "Access required" }, 401);
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: "Request too large" }, 413);
    let input: z.infer<typeof requestSchema>;
    try { input = requestSchema.parse(JSON.parse(raw)); } catch { return reply({ error: "INVALID_REQUEST" }, 400); }
    try {
      if (deps.isTrialUser(input.userId)) return reply({ access: "trial" });
      const { entitlement } = await deps.withTx((tx) => readAccess(tx, input.userId, now()));
      if (!entitlement.active) return reply({ access: "denied", reason: entitlement.reason, manage_url: deps.manageUrl });
      return reply({ access: "pro", manage_url: deps.manageUrl });
    } catch {
      // Fail closed: the Worker refuses protected work when the Pro service is unavailable.
      return reply({ error: "ACCOUNTING_UNAVAILABLE" }, 503);
    }
  };
}
