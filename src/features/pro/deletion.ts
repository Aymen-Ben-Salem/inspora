import { sql } from "drizzle-orm";
import { closeProAccount, type ProTx } from "./repository";

const proSchemaPresent = async (tx: ProTx) => {
  const exists = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null as present`);
  return (exists as unknown as { rows: { present: boolean }[] }).rows[0]?.present === true;
};

/**
 * Called inside the account-deletion transaction. Closes the Pro account so no new
 * access or Checkout can start. Safe before the Pro migration is applied. Provider
 * subscription cancellation follows the commit.
 */
export async function closeProAccountForDeletion(tx: ProTx, userId: string, now = new Date()) {
  if (!(await proSchemaPresent(tx))) return false;
  return (await closeProAccount(tx, { userId, now })).closed;
}

/**
 * Admin-initiated account removal must not cancel a customer's paid subscription
 * without the owner's own confirmed deletion: refuse while Pro billing exists.
 */
export async function proAccountBlocksAdminDeletion(tx: ProTx, userId: string) {
  if (!(await proSchemaPresent(tx))) return false;
  const result = await tx.execute(sql`select 1 from pro_accounts a where a.user_id = ${userId} and a.state = 'open' and exists (select 1 from pro_subscriptions s where s.user_id = a.user_id and s.ended_at is null) limit 1`);
  return (result as unknown as { rows: unknown[] }).rows.length > 0;
}

type ProClosureState = { state: string; providerClosurePending: boolean };

/** Missing Pro schema/record means ordinary account cleanup is unchanged. */
export async function readProIdentityClosure(tx: ProTx, userId: string): Promise<ProClosureState | null> {
  if (!(await proSchemaPresent(tx))) return null;
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

/** A live Pro subscription to warn about before the owner confirms permanent deletion. */
export async function readProDeletionWarning(tx: ProTx, userId: string) {
  if (!(await proSchemaPresent(tx))) return null;
  const result = await tx.execute(sql`select 1 from pro_accounts a where a.user_id = ${userId} and a.state = 'open' and exists (select 1 from pro_subscriptions s where s.user_id = a.user_id and s.ended_at is null) limit 1`);
  return (result as unknown as { rows: unknown[] }).rows.length > 0 ? { subscribed: true as const } : null;
}
