import { sql } from "drizzle-orm";
import { closeProAccount, type ProTx } from "./repository";

/**
 * Called inside the account-deletion transaction. Forfeits remaining credits with
 * an auditable ledger record and stops recharge. Safe before the Pro migration is
 * applied. Provider subscription cancellation follows the commit.
 */
export async function closeProAccountForDeletion(tx: ProTx, userId: string, now = new Date()) {
  const exists = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null as present`);
  if (!(exists as unknown as { rows: { present: boolean }[] }).rows[0]?.present) return false;
  return (await closeProAccount(tx, { userId, now })).closed;
}

/**
 * Admin-initiated account removal must not forfeit a customer's prepaid value
 * without the owner's own confirmed deletion: refuse while Pro billing or credits exist.
 */
export async function proAccountBlocksAdminDeletion(tx: ProTx, userId: string, now = new Date()) {
  const exists = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null as present`);
  if (!(exists as unknown as { rows: { present: boolean }[] }).rows[0]?.present) return false;
  const result = await tx.execute(sql`select 1 from pro_accounts a where a.user_id = ${userId} and a.state = 'open' and (a.purchased_balance > 0 or (a.included_balance > 0 and a.included_period_end > ${now}) or exists (select 1 from pro_subscriptions s where s.user_id = a.user_id and s.ended_at is null)) limit 1`);
  return (result as unknown as { rows: unknown[] }).rows.length > 0;
}

type ProClosureState = { state: string; providerClosurePending: boolean };

/** Missing Pro schema/record means ordinary account cleanup is unchanged. */
export async function readProIdentityClosure(tx: ProTx, userId: string): Promise<ProClosureState | null> {
  const exists = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null as present`);
  if (!(exists as unknown as { rows: { present: boolean }[] }).rows[0]?.present) return null;
  const result = await tx.execute(sql`select state,provider_closure_pending from pro_accounts where user_id = ${userId}`);
  const row = (result as unknown as { rows: { state: string; provider_closure_pending: boolean }[] }).rows[0];
  return row ? { state: row.state, providerClosurePending: row.provider_closure_pending } : null;
}

/** Provider failures must keep the identity recoverable, not finalize deletion. */
export function createProIdentityDeletionGuard(deps: {
  read(userId: string): Promise<ProClosureState | null>;
  close(userId: string): Promise<unknown>;
}) {
  return async (userId: string) => {
    const before = await deps.read(userId);
    if (!before || (before.state === "closed" && !before.providerClosurePending)) return;
    await deps.close(userId);
    // Verify the durable record. A successful provider call alone is not proof
    // that every subscription/Checkout was reconciled and cancellation finished.
    const after = await deps.read(userId);
    if (!after || after.state !== "closed" || after.providerClosurePending)
      throw new Error("Pro billing cancellation is pending; account deletion will retry.");
  };
}

/** Existing cleanup jobs retry cancellation themselves before deleting Clerk. */
export async function requireProClosureBeforeIdentityDeletion(userId: string) {
  const { withWriteTransaction } = await import("@/db/write-client");
  const guard = createProIdentityDeletionGuard({
    read: (id) => withWriteTransaction((tx) => readProIdentityClosure(tx as unknown as ProTx, id)),
    close: async (id) => {
      const { proService } = await import("./server");
      await proService().closeAccount(id);
    },
  });
  // Financial recovery is independent of the public Pro feature flag. Turning
  // off its UI must never skip cancellation of an already-billed account.
  await guard(userId);
}

/** Clerk webhooks may arrive after external identity removal; retain and retry billing recovery. */
export async function completeProClosureAfterDeletion(userId: string) {
  try { await requireProClosureBeforeIdentityDeletion(userId); }
  catch { console.error("Pro provider closure remains pending."); }
}

/** Remaining Pro value to show before the owner confirms permanent deletion. */
export async function readProDeletionWarning(tx: ProTx, userId: string, now = new Date()) {
  const exists = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null as present`);
  if (!(exists as unknown as { rows: { present: boolean }[] }).rows[0]?.present) return null;
  const result = await tx.execute(sql`select a.purchased_balance, case when a.included_period_end > ${now} then a.included_balance else 0 end as included_balance, exists (select 1 from pro_subscriptions s where s.user_id = a.user_id and s.ended_at is null) as subscribed from pro_accounts a where a.user_id = ${userId} and a.state = 'open'`);
  const row = (result as unknown as { rows: { purchased_balance: number; included_balance: number; subscribed: boolean }[] }).rows[0];
  if (!row) return null;
  const credits = Number(row.purchased_balance) + Number(row.included_balance);
  return credits > 0 || row.subscribed ? { credits, purchasedCredits: Number(row.purchased_balance), subscribed: Boolean(row.subscribed) } : null;
}
