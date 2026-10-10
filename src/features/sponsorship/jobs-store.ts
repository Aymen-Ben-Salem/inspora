import "server-only";
import { sponsorJobs } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
export async function queueSponsorJob(
  tx: WriteTx,
  kind: "reconcile" | "event" | "delete_owner",
  targetId: string,
  key: string,
  now = new Date(),
) {
  await tx
    .insert(sponsorJobs)
    .values({ kind, targetId, idempotencyKey: key, nextAttemptAt: now })
    .onConflictDoNothing({ target: sponsorJobs.idempotencyKey });
}
