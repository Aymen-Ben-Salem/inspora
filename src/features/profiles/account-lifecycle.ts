import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  cleanupJobs,
  clerkWebhookReceipts,
  profileAccounts,
} from "../../db/schema";
import { withWriteTransaction } from "../../db/write-client";
import type { SubmissionResult } from "../submissions/types";

type DeletionRequest = { jobId: string; state: "pending" };

export type AccountDeletionStore = {
  request(userId: string): Promise<DeletionRequest | null>;
};

export async function requestAccountDeletionWithStore(
  store: AccountDeletionStore,
  userId: string,
): Promise<SubmissionResult<{ jobId: string }>> {
  const requested = await store.request(userId);
  return requested
    ? { ok: true, value: { jobId: requested.jobId } }
    : { ok: false, code: "forbidden", message: "Your profile account was not found." };
}

export type WebhookDeletionStore = {
  record(input: { eventId: string; userId: string }): Promise<"queued" | "missing" | "duplicate">;
};

export async function requestWebhookAccountDeletionWithStore(
  store: WebhookDeletionStore,
  input: { eventId: string; userId: string },
) {
  return { state: await store.record(input) } as const;
}

function accountCleanupKey(userId: string) {
  return `account:${userId}`;
}

const productionAccountDeletionStore: AccountDeletionStore = {
  async request(userId) {
    return withWriteTransaction(async (tx) => {
      const [account] = await tx
        .select({ status: profileAccounts.status })
        .from(profileAccounts)
        .where(eq(profileAccounts.userId, userId))
        .for("update");
      if (!account) return null;

      const now = new Date();
      if (account.status === "active") {
        await tx
          .update(profileAccounts)
          .set({
            status: "deleting",
            deletionRequestedAt: now,
            deletionError: null,
            updatedAt: now,
          })
          .where(eq(profileAccounts.userId, userId));
      }

      const [created] = await tx
        .insert(cleanupJobs)
        .values({
          id: randomUUID(),
          kind: "delete_account",
          targetId: userId,
          idempotencyKey: accountCleanupKey(userId),
          notBefore: now,
          nextAttemptAt: now,
        })
        .onConflictDoNothing({ target: cleanupJobs.idempotencyKey })
        .returning({ id: cleanupJobs.id });
      if (created) return { jobId: created.id, state: "pending" };

      const [existing] = await tx
        .select({ id: cleanupJobs.id })
        .from(cleanupJobs)
        .where(and(
          eq(cleanupJobs.kind, "delete_account"),
          eq(cleanupJobs.idempotencyKey, accountCleanupKey(userId)),
        ))
        .limit(1);
      if (!existing) throw new Error("The account cleanup job could not be found.");
      return { jobId: existing.id, state: "pending" };
    });
  },
};

const productionWebhookDeletionStore: WebhookDeletionStore = {
  async record({ eventId, userId }) {
    return withWriteTransaction(async (tx) => {
      const [receipt] = await tx
        .insert(clerkWebhookReceipts)
        .values({ eventId, eventType: "user.deleted" })
        .onConflictDoNothing({ target: clerkWebhookReceipts.eventId })
        .returning({ eventId: clerkWebhookReceipts.eventId });
      if (!receipt) return "duplicate";

      const [account] = await tx
        .select({ userId: profileAccounts.userId })
        .from(profileAccounts)
        .where(eq(profileAccounts.userId, userId))
        .for("update");
      if (!account) return "missing";

      const now = new Date();
      await tx
        .update(profileAccounts)
        .set({
          status: "deleting",
          deletionRequestedAt: now,
          deletionError: null,
          updatedAt: now,
        })
        .where(eq(profileAccounts.userId, userId));
      await tx
        .insert(cleanupJobs)
        .values({
          kind: "delete_account",
          targetId: userId,
          idempotencyKey: accountCleanupKey(userId),
          notBefore: now,
          nextAttemptAt: now,
        })
        .onConflictDoNothing({ target: cleanupJobs.idempotencyKey });
      return "queued";
    });
  },
};

export function requestAccountDeletion(userId: string) {
  return requestAccountDeletionWithStore(productionAccountDeletionStore, userId);
}

export function requestWebhookAccountDeletion(input: { eventId: string; userId: string }) {
  return requestWebhookAccountDeletionWithStore(productionWebhookDeletionStore, input);
}
