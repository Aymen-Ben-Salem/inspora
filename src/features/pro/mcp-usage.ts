import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { completeReservation, readAccess, reserveCredits, type Balances } from "./repository";
import type { WithProTransaction } from "./service";

const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const userId = z.string().regex(/^user_[A-Za-z0-9]{1,100}$/);
const operationKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("access"), userId }).strict(),
  z.object({ action: z.literal("reserve"), userId, operationKey, feature: z.literal("mcp_search") }).strict(),
  z.object({ action: z.literal("complete"), userId, operationKey, resultCount: z.number().int().min(0).max(100) }).strict(),
]);

export type McpUsageDeps = {
  token: string | undefined;
  withTx: WithProTransaction;
  /** Approved nonbillable team trial (site admins and the explicit MCP trial allowlist). */
  isTrialUser: (userId: string) => boolean;
  manageUrl: string;
  /** Run an automatic recharge after the response; never inside the search path. */
  defer: (purchaseId: string) => void;
  now?: () => Date;
};

const digest = (value: string) => createHash("sha256").update(value).digest();
const balanceView = (balances: Balances | null) => (balances ? { included: balances.included, purchased: balances.purchased, available: balances.available } : null);

/**
 * Private boundary between the hosted MCP Worker and the shared Pro accounting
 * service. Returns only access state, balances and a management link: never
 * payment, card or account details.
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
    const denied = (reason: string, extra: Record<string, unknown> = {}) => reply({ access: "denied", reason, manage_url: deps.manageUrl, ...extra });
    try {
      if (deps.isTrialUser(input.userId)) return reply(input.action === "complete" ? { state: "nonbillable" } : { access: "trial" });
      if (input.action === "access") {
        const access = await deps.withTx((tx) => readAccess(tx, input.userId, now()));
        if (!access.entitlement.active) return denied(access.entitlement.reason, { balance: balanceView(access.balances) });
        return reply({ access: "pro", balance: balanceView(access.balances), manage_url: deps.manageUrl });
      }
      if (input.action === "reserve") {
        const result = await deps.withTx((tx) => reserveCredits(tx, { userId: input.userId, operationKey: input.operationKey, feature: input.feature, now: now() }));
        const recharge = "rechargePurchaseId" in result ? result.rechargePurchaseId : null;
        if (recharge) deps.defer(recharge);
        if (result.status === "denied")
          return denied(result.reason, { balance: balanceView(result.balances), recharge_pending: result.rechargePending });
        const state = result.status === "reserved" ? "reserved" : result.status === "replay_settled" ? "replayed" : "in_progress";
        return reply({ access: "pro", state, balance: balanceView(result.balances), manage_url: deps.manageUrl });
      }
      const result = await deps.withTx((tx) => completeReservation(tx, { userId: input.userId, operationKey: input.operationKey, resultCount: input.resultCount, now: now() }));
      return reply({ state: result.state, balance: balanceView(result.balances) });
    } catch {
      // Fail closed: the Worker refuses billable work when accounting is unavailable.
      return reply({ error: "ACCOUNTING_UNAVAILABLE" }, 503);
    }
  };
}
