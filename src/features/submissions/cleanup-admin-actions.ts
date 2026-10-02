"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../../auth/require-admin";
import { requireDatabase } from "../../db/client";
import { adminAuditLogs } from "../../db/schema";
import { attemptCleanupJob, cleanExpiredItems } from "./cleanup";

export type CleanupActionState = { message: string; ok: boolean };

export async function retryAdminCleanup(_previous: CleanupActionState, form: FormData): Promise<CleanupActionState> {
  void _previous;
  const { userId } = await requireAdmin();
  const parsed = z.string().uuid().safeParse(form.get("jobId"));
  if (!parsed.success) return { ok: false, message: "Choose a valid cleanup item." };
  try {
    // Existing creator-domain audit category covers private account/submission maintenance.
    await requireDatabase().insert(adminAuditLogs).values({ actorId: userId, action: "cleanup.retry", resourceType: "creator", details: { cleanupJobId: parsed.data } });
    const state = await attemptCleanupJob(parsed.data);
    revalidatePath("/admin", "layout");
    return state === "completed"
      ? { ok: true, message: "Cleanup completed. Already completed items need no further action." }
      : { ok: false, message: "Cleanup is still pending. If another attempt is running, wait for it to finish; otherwise retry after the provider is available." };
  } catch {
    return { ok: false, message: "Cleanup could not be confirmed. Refresh the list before retrying." };
  }
}

export async function cleanAdminExpiredItems(_previous: CleanupActionState, _form: FormData): Promise<CleanupActionState> {
  void _form;
  void _previous;
  const { userId } = await requireAdmin();
  try {
    await requireDatabase().insert(adminAuditLogs).values({ actorId: userId, action: "cleanup.expired", resourceType: "creator", details: { batchSize: 25 } });
    const result = await cleanExpiredItems();
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Processed ${result.expiredSubmissions} expired submissions and ${result.abandonedUploads} abandoned uploads, and removed expired temporary records. Any unfinished file deletion appears below. Repeat if more expired items remain.` };
  } catch {
    return { ok: false, message: "Expired-item cleanup did not finish. Refresh to see what remains, then retry." };
  }
}

