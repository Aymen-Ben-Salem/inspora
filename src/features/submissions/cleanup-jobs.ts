import "server-only";

import { cleanupJobs } from "../../db/schema";
import type { WriteTx } from "../../db/write-client";
import type { CleanupJobInput } from "./types";

export async function enqueueCleanup(tx: WriteTx, input: CleanupJobInput): Promise<void> {
  const notBefore = new Date(input.notBefore);
  if (Number.isNaN(notBefore.getTime())) throw new Error("Cleanup notBefore must be an ISO timestamp.");
  await tx.insert(cleanupJobs).values({
    kind: input.kind, targetId: input.targetId,
    idempotencyKey: input.idempotencyKey, notBefore,
  }).onConflictDoNothing({ target: cleanupJobs.idempotencyKey });
}
